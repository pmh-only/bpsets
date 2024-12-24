import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand
} from '@aws-sdk/client-ecs'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class ECSFargateLatestPlatformVersion implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getServices = async () => {
    const clustersResponse = await this.memoClient.send(new ListClustersCommand({}))
    const clusterArns = clustersResponse.clusterArns || []
    const services: { clusterArn: string; serviceArn: string }[] = []

    for (const clusterArn of clusterArns) {
      const servicesResponse = await this.memoClient.send(
        new ListServicesCommand({ cluster: clusterArn })
      )
      for (const serviceArn of servicesResponse.serviceArns || []) {
        services.push({ clusterArn, serviceArn })
      }
    }

    return services
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const services = await this.getServices()

    for (const { clusterArn, serviceArn } of services) {
      const serviceResponse = await this.memoClient.send(
        new DescribeServicesCommand({ cluster: clusterArn, services: [serviceArn] })
      )

      const service = serviceResponse.services?.[0]
      if (service?.platformVersion === 'LATEST') {
        compliantResources.push(service.serviceArn!)
      } else {
        nonCompliantResources.push(service?.serviceArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const serviceArn of nonCompliantResources) {
      const clusterArn = serviceArn.split(':cluster/')[1].split(':service/')[0]

      await this.client.send(
        new UpdateServiceCommand({
          cluster: clusterArn,
          service: serviceArn,
          platformVersion: 'LATEST'
        })
      )
    }
  }
}
