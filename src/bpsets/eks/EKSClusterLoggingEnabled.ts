import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
  UpdateClusterConfigCommand
} from '@aws-sdk/client-eks'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EKSClusterLoggingEnabled implements BPSet {
  private readonly client = new EKSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getClusters = async () => {
    const clusterNamesResponse = await this.memoClient.send(new ListClustersCommand({}))
    const clusterNames = clusterNamesResponse.clusters || []
    const clusters = []
    for (const clusterName of clusterNames) {
      const cluster = await this.memoClient.send(
        new DescribeClusterCommand({ name: clusterName })
      )
      clusters.push(cluster.cluster!)
    }
    return clusters
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const clusters = await this.getClusters()

    for (const cluster of clusters) {
      const clusterLogging = cluster.logging?.clusterLogging?.[0]
      if (clusterLogging?.enabled && clusterLogging.types?.length === 5) {
        compliantResources.push(cluster.arn!)
      } else {
        nonCompliantResources.push(cluster.arn!)
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
      const clusterName = arn.split(':cluster/')[1]

      await this.client.send(
        new UpdateClusterConfigCommand({
          name: clusterName,
          logging: {
            clusterLogging: [
              {
                enabled: true,
                types: ['api', 'audit', 'authenticator', 'controllerManager', 'scheduler']
              }
            ]
          }
        })
      )
    }
  }
}
