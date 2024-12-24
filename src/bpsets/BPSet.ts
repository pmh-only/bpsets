/**
 * This interface defines required structure for all bpsets.
 * 
 * Modifying this interface causes VERY large blast impact.
 * SO PLEASE DO NOT MODIFY.
 * 
 * @author Minhyeok Park <pmh_only@pmh.codes>
 */
export interface BPSet {
  check: () => Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: {
      name: string
    }[]
  }>,
  fix: (
    nonCompliantResources: string[],
    requiredParametersForFix: {
      name: string,
      value: string
    }[]
  ) => Promise<void>
}
