# Audio Player V2 Requirements

Future enhancements for a richer listening experience, inspired by the Bible Savvy Podcast UI design.

---

## Reference Design

![Minimal floating player](/Users/proctoi/.gemini/antigravity/brain/738fe413-eab8-4b9b-a574-bbafbcb8dbc0/uploaded_image_0_1767310311838.png)

![Expanded player overlay](/Users/proctoi/.gemini/antigravity/brain/738fe413-eab8-4b9b-a574-bbafbcb8dbc0/uploaded_image_1_1767310311838.png)

---

## V2 Features

### Floating Mini Player
- **Sticky bottom bar** that persists while scrolling the article
- **Minimal controls**: small album art, play/pause, skip ±30s
- **Tappable to expand** into full player overlay

### Expanded Player Overlay
- **Article image/artwork** as hero visual (from article metadata)
- **Article title & source** displayed prominently
- **Full progress bar** with current time / remaining time
- **Playback speed selector** (1.5x shown inline)
- **Skip controls** (±15s, ±30s)
- **Transcript icon** (optional: jump to current position in article)
- **Dismissible** - collapses back to mini player

### Visual Waveform / Progress
- Animated progress indicator
- Could show waveform visualization or simple bar

### Global Persistence (Optional)
- Player could persist across pages (not just article page)
- "Now Playing" indicator in navigation

---

## Design Notes

| Aspect | Guideline |
|--------|-----------|
| **Aesthetic** | Dark, immersive, premium feel |
| **Animation** | Smooth expand/collapse transitions |
| **Mobile-first** | Touch-friendly, large tap targets |
| **Accessibility** | Visible focus states, aria labels |

---

## Implementation Considerations

- State management for global player (React context or Zustand)
- CSS animations for expand/collapse
- Portal for overlay to escape article container
- Consider background audio playback on mobile

---

## Priority Order

1. Floating mini player at article page bottom
2. Expand/collapse to full player
3. Article artwork integration
4. Smooth animations
5. Global player (cross-page persistence)
