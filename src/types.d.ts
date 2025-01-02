/**
 * This interface defines required structure for all bpsets.
 * 
 * Modifying this interface causes VERY large blast impact.
 * SO PLEASE DO NOT MODIFY.
 * 
 * @author Minhyeok Park <pmh_only@pmh.codes>
 */
export interface BPSet {
  getMetadata: () => BPSetMetadata
  getStats: () => BPSetStats
  clearStats: () => void
  check:  () => Promise<void>
  fix: BPSetFixFn
}

export type BPSetFixFn = (
  nonCompliantResources: string[],
  requiredParametersForFix: {
    name: string,
    value: string
  }[]
) => Promise<void>

export interface BPSetMetadata {
  name: string
  description: string
  priority: number
  priorityReason: string
  awsService: string
  awsServiceCategory: string
  bestPracticeCategory: string
  requiredParametersForFix: {
    name: string
    description: string
    default: string
    example: string
  }[]
  isFixFunctionUsesDestructiveCommand: boolean
  commandUsedInCheckFunction: {
    name: string
    reason: string
  }[]
  commandUsedInFixFunction: {
    name: string
    reason: string
  }[]
  adviseBeforeFixFunction: string
}

export interface BPSetStats {
  nonCompliantResources: string[]
  compliantResources: string[]
  status: 'LOADED' | 'CHECKING' | 'ERROR' | 'FINISHED'
  errorMessage: {
    date: Date,
    message: string
  }[]
}
