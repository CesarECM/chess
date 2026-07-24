import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isGuest: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setGuest: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isGuest: true,
  isLoading: true,
  setUser: (user) => set({ user, isGuest: false, isLoading: false }),
  setGuest: () => set({ user: null, isGuest: true, isLoading: false }),
  reset: () => set({ user: null, isGuest: true, isLoading: false }),
}));
