import { create } from 'zustand';
import { getProfile, onAuthStateChange } from '@/services/auth';
import { migrateGuestProgress } from '@/services/migration';
import { useUserStore } from './useUserStore';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isGuest: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  setUser: (user: User | null) => void;
  setGuest: () => void;
  reset: () => void;
  initAuth: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isGuest: true,
  isLoading: true,
  isPasswordRecovery: false,
  setUser: (user) => set({ user, isGuest: false, isLoading: false }),
  setGuest: () => set({ user: null, isGuest: true, isLoading: false }),
  reset: () => set({ user: null, isGuest: true, isLoading: false, isPasswordRecovery: false }),

  initAuth: () => {
    const { data: { subscription } } = onAuthStateChange(async (event, user) => {
      if (event === 'PASSWORD_RECOVERY') {
        set({ isPasswordRecovery: true, isLoading: false });
        return;
      }
      if (user) {
        await migrateGuestProgress(user.id);
        const profile = await getProfile(user.id);
        if (profile) useUserStore.getState().hydrate(profile);
        set({
          user: { ...user, elo: profile?.elo ?? 800 },
          isGuest: false,
          isLoading: false,
          isPasswordRecovery: false,
        });
      } else {
        set({ user: null, isGuest: true, isLoading: false, isPasswordRecovery: false });
        if (event === 'SIGNED_OUT') useUserStore.getState().reset();
      }
    });

    return () => subscription.unsubscribe();
  },
}));
