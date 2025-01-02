import { BPSet } from "./types";
import { readdir } from 'node:fs/promises'
import path from 'node:path'

export class BPManager {
  private static _instance = new BPManager()

  public static getInstance = () =>
    this._instance

  // ---

  private readonly bpSets:
    Record<string, BPSet> = {}   

  private constructor() {
    this.loadBPSets()
  }

  private async loadBPSets() {
    const bpSetFolders = await readdir(path.join(__dirname, 'bpsets'))
    
    for (const bpSetFolder of bpSetFolders) {
      const bpSetFiles = await readdir(path.join(__dirname, 'bpsets', bpSetFolder))

      for (const bpSetFile of bpSetFiles) {
        const bpSetPath = path.join(__dirname, 'bpsets', bpSetFolder, bpSetFile)
        const bpSetClasses = await import(bpSetPath) as Record<string, new () => BPSet>
  
        for (const bpSetClass of Object.keys(bpSetClasses)) {
          this.bpSets[bpSetClass] = new bpSetClasses[bpSetClass]()
          console.log('BPSet implement,', bpSetClass, 'loaded')
        }
      }
    }
  }

  public runCheckOnce(name: string) {
    return this.bpSets[name].check()
  }

  public runCheckAll(finished = (name: string) => {}) {
    const checkJobs: Promise<void>[] = []

    for (const bpset of Object.values(this.bpSets))
      checkJobs.push(
        bpset
          .check()
          .then(() =>
            finished(bpset.getMetadata().name))
      )
    
    return Promise.all(checkJobs)
  }

  public runFix(name: string, requiredParametersForFix: { name: string, value: string }[]) {
    return this
      .bpSets[name]
      .fix(
        this.bpSets[name].getStats().nonCompliantResources,
        requiredParametersForFix
      )
  }

  public readonly getBPSets = () =>
    Object.values(this.bpSets)
}
