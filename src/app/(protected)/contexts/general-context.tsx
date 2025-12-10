// make a super generl context provider that for now just has the one state of
// show Add article button

import { createContext, useState } from "react";

type GeneralContextType = {
  isAddFormOpen: boolean;
  setIsAddFormOpen: (open: boolean) => void;
  metadataEditArticle: {
    id: string;
    title: string;
    url: string;
  } | null;
  setMetadataEditArticle: (
    article: {
      id: string;
      title: string;
      url: string;
    } | null,
  ) => void;
};

export const GeneralContext = createContext<GeneralContextType>({
  isAddFormOpen: false,
  setIsAddFormOpen: () => {},
  metadataEditArticle: null,
  setMetadataEditArticle: () => {},
});

export const GeneralProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [metadataEditArticle, setMetadataEditArticle] = useState<{
    id: string;
    title: string;
    url: string;
  } | null>(null);

  return (
    <GeneralContext.Provider
      value={{
        isAddFormOpen,
        setIsAddFormOpen,
        metadataEditArticle,
        setMetadataEditArticle,
      }}
    >
      {children}
    </GeneralContext.Provider>
  );
};
