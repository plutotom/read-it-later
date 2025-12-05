// make a super generl context provider that for now just has the one state of
// show Add article button

import { createContext, useState } from "react";

type GeneralContextType = {
  isAddFormOpen: boolean;
  setIsAddFormOpen: (open: boolean) => void;
};

export const GeneralContext = createContext<GeneralContextType>({
  isAddFormOpen: false,
  setIsAddFormOpen: () => {},
});

export const GeneralProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  return (
    <GeneralContext.Provider value={{ isAddFormOpen, setIsAddFormOpen }}>
      {children}
    </GeneralContext.Provider>
  );
};
