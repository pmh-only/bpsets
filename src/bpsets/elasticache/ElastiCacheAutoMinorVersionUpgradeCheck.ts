import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  ModifyCacheClusterCommand
} from '@aws-sdk/client-elasticache'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ElastiCacheAutoMinorVersionUpgradeCheck implements BPSet {
  private readonly client = new ElastiCacheClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getClusters = async () => {
    const response = await this.memoClient.send(new DescribeCacheClustersCommand({}))
    return response.CacheClusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const clusters = await this.getClusters()

    for (const cluster of clusters) {
      if (cluster.AutoMinorVersionUpgrade) {
        compliantResources.push(cluster.ARN!)
      } else {
        nonCompliantResources.push(cluster.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster:')[1]
      await this.client.send(
        new ModifyCacheClusterCommand({
          CacheClusterId: clusterId,
          AutoMinorVersionUpgrade: true
        })
      )
    }
  }
}
