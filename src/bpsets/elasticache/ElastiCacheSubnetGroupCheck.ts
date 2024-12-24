import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  DeleteCacheClusterCommand,
  CreateCacheClusterCommand
} from '@aws-sdk/client-elasticache'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ElastiCacheSubnetGroupCheck implements BPSet {
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
      if (cluster.CacheSubnetGroupName !== 'default') {
        compliantResources.push(cluster.ARN!)
      } else {
        nonCompliantResources.push(cluster.ARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'subnet-group-name' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const subnetGroupName = requiredParametersForFix.find(
      param => param.name === 'subnet-group-name'
    )?.value

    if (!subnetGroupName) {
      throw new Error("Required parameter 'subnet-group-name' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster:')[1]
      const cluster = await this.memoClient.send(
        new DescribeCacheClustersCommand({ CacheClusterId: clusterId })
      )
      const clusterDetails = cluster.CacheClusters?.[0]

      if (!clusterDetails) {
        continue
      }

      // Delete the non-compliant cluster
      await this.client.send(
        new DeleteCacheClusterCommand({
          CacheClusterId: clusterId
        })
      )

      // Recreate the cluster with the desired subnet group
      await this.client.send(
        new CreateCacheClusterCommand({
          CacheClusterId: clusterDetails.CacheClusterId!,
          Engine: clusterDetails.Engine!,
          CacheNodeType: clusterDetails.CacheNodeType!,
          NumCacheNodes: clusterDetails.NumCacheNodes!,
          CacheSubnetGroupName: subnetGroupName,
          SecurityGroupIds: clusterDetails.SecurityGroups?.map(group => group.SecurityGroupId) as string[],
          PreferredMaintenanceWindow: clusterDetails.PreferredMaintenanceWindow,
          EngineVersion: clusterDetails.EngineVersion
        })
      )
    }
  }
}
