export interface BPSet {
  check: () => Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: {name: string}[]
  }>,
  fix: (nonCompliantResources: string[], requiredParametersForFix: {name: string, value: string}[]) => Promise<void>
}
