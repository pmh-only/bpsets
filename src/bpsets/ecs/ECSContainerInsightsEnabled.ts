import {
  ECSClient,
  DescribeClustersCommand,
  UpdateClusterSettingsCommand
} from '@aws-sdk/client-ecs'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ECSContainerInsightsEnabled implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getClusters = async () => {
    const response = await this.memoClient.send(new DescribeClustersCommand({ include: ['SETTINGS'] }))
    return response.clusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const clusters = await this.getClusters()

    for (const cluster of clusters) {
      const containerInsightsSetting = cluster.settings?.find(
        setting => setting.name === 'containerInsights'
      )
      if (containerInsightsSetting?.value === 'enabled') {
        compliantResources.push(cluster.clusterArn!)
      } else {
        nonCompliantResources.push(cluster.clusterArn!)
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
      await this.client.send(
        new UpdateClusterSettingsCommand({
          cluster: arn,
          settings: [{ name: 'containerInsights', value: 'enabled' }]
        })
      )
    }
  }
}
