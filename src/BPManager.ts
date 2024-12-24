import { BPSet, BPSetMetadata } from "./types";
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export class BPManager {
  private static _instance = new BPManager()

  public static getInstance = () =>
    this._instance

  // ---

  private readonly bpSets:
    Record<string, BPSet | undefined> = {}   

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
      const bpSetClasses = await import('../' + bpSetPath) as Record<string, BPSet>

      for (const bpSetClass of Object.keys(bpSetClasses))
        this.bpSets[bpSetClass] = bpSetClasses[bpSetClass]
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
        idx
      }
    }
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
