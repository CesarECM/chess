// PostHog — se configura en Sprint 13
const noop = (..._args: unknown[]) => {};

export const analytics = {
  identify: noop,
  track: noop,
  screen: noop,
  reset: noop,
};
