const DELETED_CLASS = "deleted";
const HIGHLIGHT_CLASS = "highlight";

type HighlightInfo = {
  color: string;
  textColor: string;
  highlightIndex: number;
  selectionString: string;
  anchor: Node;
  anchorOffset: number;
  focus: Node;
  focusOffset: number;
};

type RecursiveWrapperResult = [boolean, number];

/**
 * Helper function to check if an element is visible
 */
function isElementVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

/**
 * Helper function to check if a node is a text node
 */
function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

/**
 * Initialize event listeners for highlight elements
 */
function initializeHighlightEventListeners(element: HTMLElement): void {
  element.addEventListener("mouseenter", () => {
    console.log("mouseenter");
  });
}

/**
 * Highlights selected text in a container element
 * @param selString - The selected text string to highlight
 * @param container - The container element where highlighting should occur
 * @param selection - The Selection object from window.getSelection()
 * @param color - Background color for the highlight (default: "yellow")
 * @param textColor - Text color for the highlight (default: "inherit")
 * @param highlightIndex - Index identifier for this highlight
 * @returns true if highlighting succeeded, false otherwise
 */
function highlight(
  selString: string,
  container: HTMLElement,
  selection: Selection,
  color = "yellow",
  textColor = "inherit",
  highlightIndex = 0,
): boolean {
  if (!selection.anchorNode || !selection.focusNode) {
    return false;
  }

  const highlightInfo: HighlightInfo = {
    color: color || "yellow",
    textColor: textColor || "inherit",
    highlightIndex: highlightIndex,
    selectionString: selString,
    anchor: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focus: selection.focusNode,
    focusOffset: selection.focusOffset,
  };

  /**
   * STEPS:
   * 1 - Use the offset of the anchor/focus to find the start of the selected text in the anchor/focus element
   *     - Use the first of the anchor of the focus elements to appear
   * 2 - From there, go through the elements and find all Text Nodes until the selected text is all found.
   *     - Wrap all the text nodes (or parts of them) in a span DOM element with special highlight class name and bg color
   * 3 - Deselect text
   * 4 - Attach mouse hover event listeners to display tools when hovering a highlight
   */

  // Step 1 + 2:
  try {
    recursiveWrapper(container, highlightInfo);
  } catch (e) {
    console.error("Error highlighting text:", e);
    return false;
  }

  // Step 3:
  if (selection.removeAllRanges) {
    selection.removeAllRanges();
  }

  // Step 4:
  const parent = container.parentElement;
  if (parent) {
    const highlightElements = parent.querySelectorAll<HTMLElement>(
      `.${HIGHLIGHT_CLASS}`,
    );
    highlightElements.forEach((el) => {
      initializeHighlightEventListeners(el);
    });
  }

  console.log("highlighted text", selString);

  return true; // No errors
}

/**
 * Recursively wraps selected text nodes with highlight elements
 */
function recursiveWrapper(
  container: HTMLElement | Node,
  highlightInfo: HighlightInfo,
): RecursiveWrapperResult {
  return _recursiveWrapper(container, highlightInfo, false, 0); // Initialize the values of 'startFound' and 'charsHighlighted'
}

/**
 * Internal recursive function that processes nodes and wraps text selections
 */
function _recursiveWrapper(
  container: HTMLElement | Node,
  highlightInfo: HighlightInfo,
  startFound: boolean,
  charsHighlighted: number,
): RecursiveWrapperResult {
  const {
    anchor,
    focus,
    anchorOffset,
    focusOffset,
    color,
    textColor,
    highlightIndex,
    selectionString,
  } = highlightInfo;
  const selectionLength = selectionString.length;

  // Convert NodeList to array for easier iteration
  const childNodes = Array.from(container.childNodes);

  for (const element of childNodes) {
    if (charsHighlighted >= selectionLength) {
      break; // Stop early if we are done highlighting
    }

    if (!isTextNode(element)) {
      // Only look at visible nodes because invisible nodes aren't included in the selected text
      // from the Window.getSelection() API
      if (element instanceof HTMLElement) {
        if (isElementVisible(element)) {
          [startFound, charsHighlighted] = _recursiveWrapper(
            element,
            highlightInfo,
            startFound,
            charsHighlighted,
          );
        }
      }
      continue;
    }

    // Step 1:
    // The first element to appear could be the anchor OR the focus node,
    // since you can highlight from left to right or right to left
    let startIndex = 0;
    if (!startFound) {
      // Check if this element is the anchor or focus node
      const isAnchor = anchor === element;
      const isFocus = focus === element;

      if (!isAnchor && !isFocus) {
        continue; // If the element is not the anchor or focus, continue
      }

      startFound = true;
      const offsets: number[] = [];
      if (isAnchor) offsets.push(anchorOffset);
      if (isFocus) offsets.push(focusOffset);
      startIndex = Math.min(...offsets);
    }

    // Step 2:
    // If we get here, we are in a text node, the start was found and we are not done highlighting
    const nodeValue = element.nodeValue;
    if (!nodeValue) {
      continue;
    }

    const parent = element.parentElement;
    if (!parent) {
      continue;
    }

    if (startIndex > nodeValue.length) {
      // Start index is beyond the length of the text node, can't find the highlight
      // NOTE: we allow the start index to be equal to the length of the text node here just in case
      throw new Error(
        `No match found for highlight string '${selectionString}'`,
      );
    }

    // Split the text content into three parts, the part before the highlight, the highlight and the part after the highlight:
    const highlightTextEl = element.splitText(startIndex);

    // Instead of simply blindly highlighting the text by counting characters,
    // we check if the text is the same as the selection string.
    let i = startIndex;
    for (; i < nodeValue.length; i++) {
      // Skip any whitespace characters in the selection string as there can
      // be more than in the text node:
      while (
        charsHighlighted < selectionLength &&
        selectionString[charsHighlighted]?.match(/\s/u)
      ) {
        charsHighlighted++;
      }

      if (charsHighlighted >= selectionLength) break;

      const char = nodeValue[i];
      if (!char) {
        break;
      }
      if (char === selectionString[charsHighlighted]) {
        charsHighlighted++;
      } else if (!char.match(/\s/u)) {
        // Similarly, if the char in the text node is a whitespace, ignore any differences
        // Otherwise, we can't find the highlight text; throw an error
        throw new Error(
          `No match found for highlight string '${selectionString}'`,
        );
      }
    }

    // If textElement is wrapped in a .highlighter--highlighted span, do not add this highlight
    // as it is already highlighted, but still count the number of charsHighlighted
    if (parent.classList.contains(HIGHLIGHT_CLASS)) {
      return [startFound, charsHighlighted];
    }

    const elementCharCount = i - startIndex; // Number of chars to highlight in this particular element
    const insertBeforeElement = highlightTextEl.splitText(elementCharCount);
    const highlightText = highlightTextEl.nodeValue;

    if (!highlightText) {
      continue;
    }

    // If the text is all whitespace, ignore it
    if (highlightText.match(/^\s*$/u)) {
      parent.normalize(); // Undo any 'splitText' operations
      return [startFound, charsHighlighted];
    }

    // If we get here, highlight!
    // Wrap the highlighted text in a custom element with the highlight class name
    // Using a custom element instead of a span prevents any outside styles on spans from affecting the highlight
    const highlightNode = document.createElement("highlighter-span");
    highlightNode.classList.add(
      color === "inherit" ? DELETED_CLASS : HIGHLIGHT_CLASS,
    );
    highlightNode.style.backgroundColor = color;
    highlightNode.style.color = textColor;
    highlightNode.dataset.highlightId = String(highlightIndex);
    highlightNode.textContent = highlightText;
    highlightTextEl.remove();
    parent.insertBefore(highlightNode, insertBeforeElement);
  }

  return [startFound, charsHighlighted];
}

export default highlight;
