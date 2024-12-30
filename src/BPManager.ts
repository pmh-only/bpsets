import { BPSet, BPSetMetadata } from "./types";
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export class BPManager {
  private static _instance = new BPManager()

  public static getInstance = () =>
    this._instance

  // ---

  private readonly bpSets:
    Record<string, BPSet> = {}   

  private readonly bpSetMetadatas:
    Record<string, BPSetMetadata> = {}

  private constructor() {
    this.loadBPSets()
    this.loadBPSetMetadatas()
  }

  private async loadBPSets() {
    const bpSetFiles = await readdir('./dist/bpsets', {
      recursive: true,
      withFileTypes: true
    })

    for (const bpSetFile of bpSetFiles) {
      if (bpSetFile.isDirectory())
        continue
      
      const bpSetPath = path.join(bpSetFile.parentPath, bpSetFile.name)
      const bpSetClasses = await import('../' + bpSetPath) as Record<string, new () => BPSet>

      for (const bpSetClass of Object.keys(bpSetClasses))
        this.bpSets[bpSetClass] = new bpSetClasses[bpSetClass]()
    }
  }

  private async loadBPSetMetadatas() {
    const bpSetMetadatasRaw = await readFile('./bpset_metadata.json')
    const bpSetMetadatas = JSON.parse(bpSetMetadatasRaw.toString('utf-8')) as BPSetMetadata[]

    for (const [idx, bpSetMetadata] of bpSetMetadatas.entries()) {
      this.bpSetMetadatas[bpSetMetadata.name] = {
        ...bpSetMetadata,
        nonCompliantResources: [],
        compliantResources: [],
        status:'LOADED',
        errorMessage: [],
        idx
      }
    }
  }

  public runCheckOnce(name: string) {
    return this
      .bpSets[name].check()
      .catch((err) => {
        this.bpSetMetadatas[name].status = 'ERROR'
        this.bpSetMetadatas[name].errorMessage.push({
          date: new Date(),
          message: err
        })

        return undefined
      })
      .then((result) => {
        if (result === undefined)
          return

        this.bpSetMetadatas[name].compliantResources = result.compliantResources
        this.bpSetMetadatas[name].nonCompliantResources = result.nonCompliantResources
        this.bpSetMetadatas[name].status = 'FINISHED'
      })
  }

  public runCheckAll(finished = (name: string) => {}) {
    const checkJobs =
      Object
        .values(this.bpSetMetadatas)
        .map(({ name }) => {
          this.bpSetMetadatas[name].status = 'CHECKING'

          return this
            .bpSets[name].check()
            .catch((err) => {
              this.bpSetMetadatas[name].status = 'ERROR'
              this.bpSetMetadatas[name].errorMessage.push({
                date: new Date(),
                message: err
              })
    
              return undefined
            })
            .then((result) => {
              if (result === undefined)
                return
    
              this.bpSetMetadatas[name].compliantResources = result.compliantResources
              this.bpSetMetadatas[name].nonCompliantResources = result.nonCompliantResources
              this.bpSetMetadatas[name].status = 'FINISHED'
              finished(name)
            })
        })
    
    return Promise.all(checkJobs)
  }

  public runFix(name: string, requiredParametersForFix: { name: string, value: string }[]) {
    return this
      .bpSets[name]
      .fix(
        this.bpSetMetadatas[name].nonCompliantResources,
        requiredParametersForFix
      )
  }

  public readonly getBPSet = (name: string) =>
    this.bpSets[name]

  public readonly getBPSetMetadata = (name: string) =>
    this.bpSetMetadatas[name]

  public readonly getBPSets = () =>
    Object.values(this.bpSets)
  
  public readonly getBPSetMetadatas = () =>
    Object.values(this.bpSetMetadatas)
}
