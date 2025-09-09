import { create } from "zustand";
import { LimitReason } from "~/lib/constants/plans";

interface UpgradeModalStore {
  isOpen: boolean;
  reason?: LimitReason;
  action: {
    openModal: (reason?: LimitReason) => void;
    closeModal: () => void;
  };
}

export const useUpgradeModalStore = create<UpgradeModalStore>((set) => ({
  isOpen: false,
  reason: undefined,
  action: {
    openModal: (reason?: LimitReason) => set({ isOpen: true, reason }),
    closeModal: () => set({ isOpen: false, reason: undefined }),
  },
}));
