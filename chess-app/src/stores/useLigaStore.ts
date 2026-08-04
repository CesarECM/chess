import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface LeagueMember {
  memberId:    string;
  userId:      string;
  elo:         number;
  puzzlesWeek: number;
  rank:        number;
  isMe:        boolean;
}

export interface LeagueInfo {
  leagueId:  string;
  weekStart: string;  // YYYY-MM-DD
  weekEnd:   string;
  members:   LeagueMember[];
  myRank:    number;
  myScore:   number;
}

export interface PreviousLigaResult {
  rank:     number;
  total:    number;
  promoted: boolean;
  demoted:  boolean;
  weekEnd:  string;
}

interface LigaState {
  current:        LeagueInfo | null;
  previousResult: PreviousLigaResult | null;
  resultSeen:     boolean;
  loading:        boolean;
}

interface LigaActions {
  setLeague:         (info: LeagueInfo) => void;
  incrementScore:    () => void;
  setPreviousResult: (result: PreviousLigaResult) => void;
  markResultSeen:    () => void;
  setLoading:        (v: boolean) => void;
  reset:             () => void;
}

const INITIAL_STATE: LigaState = {
  current:        null,
  previousResult: null,
  resultSeen:     true,
  loading:        false,
};

export const useLigaStore = create<LigaState & LigaActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setLeague: (info) => set({ current: info }),

      incrementScore: () =>
        set((s) => {
          if (!s.current) return s;
          const myScore = s.current.myScore + 1;
          const members = s.current.members.map((m) =>
            m.isMe ? { ...m, puzzlesWeek: myScore } : m,
          );
          const sorted = [...members].sort((a, b) => b.puzzlesWeek - a.puzzlesWeek);
          const ranked = members.map((m) => ({
            ...m,
            rank: sorted.findIndex((x) => x.userId === m.userId) + 1,
          }));
          const myRank = ranked.find((m) => m.isMe)?.rank ?? s.current.myRank;
          return { current: { ...s.current, myScore, myRank, members: ranked } };
        }),

      setPreviousResult: (result) => set({ previousResult: result, resultSeen: false }),
      markResultSeen:    ()         => set({ resultSeen: true }),
      setLoading:        (v)        => set({ loading: v }),
      reset:             ()         => set(INITIAL_STATE),
    }),
    {
      name:    'liga-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        current:        s.current,
        previousResult: s.previousResult,
        resultSeen:     s.resultSeen,
      }),
    },
  ),
);
