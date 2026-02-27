/**
 * Application constants - aligned with backend schema defaults.
 * No hardcoded values in components; use these or fetch from API.
 */
export const CONFIG = {
  /** Default sprint duration (weeks) - from project schema */
  defaultSprintDurationWeeks: 2,
  /** Minimum sprints when calculations unavailable */
  minSprints: 1,
  /** Default contingency % when version not loaded - from version model */
  defaultContingencyPct: 0,
  /** Default working days per month - from SprintConfig/team schema */
  defaultWorkingDaysPerMonth: 20,
  /** Default hours per day - from team schema */
  defaultHoursPerDay: 8,
  /** Default utilization % when member data missing - typical full-time on project */
  defaultUtilizationPct: 80,
  /** Full-time utilization for new members */
  fullTimeUtilizationPct: 100,
  /** Task contingency by seniority - aligned with backend */
  taskContingencyJunior: 1.15,
  taskContingencySenior: 1.05,
  taskContingencyDefault: 1.1,
} as const;
