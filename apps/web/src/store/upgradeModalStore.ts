import { create, type StateCreator } from "zustand";
import { LimitReason } from "~/lib/constants/plans";

const createUpgradeModalActions = (
  set: Parameters<StateCreator<UpgradeModalStore>>[0],
) => ({
  openModal: (reason?: LimitReason) => set({ isOpen: true, reason }),
  closeModal: () => set({ isOpen: false, reason: undefined }),
});

interface UpgradeModalStore {
  isOpen: boolean;
  reason?: LimitReason;
  action: ReturnType<typeof createUpgradeModalActions>;
}

const createUpgradeModalStore: StateCreator<UpgradeModalStore> = (set) => ({
  isOpen: false,
  reason: undefined,
  action: createUpgradeModalActions(set),
});

export const useUpgradeModalStore = create<UpgradeModalStore>(
  createUpgradeModalStore,
);
