import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand
} from '@aws-sdk/client-ecs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSFargateLatestPlatformVersion implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getServices = async () => {
    const clustersResponse = await this.memoClient.send(new ListClustersCommand({}))
    const clusterArns = clustersResponse.clusterArns || []
    const services: { clusterArn: string; serviceArn: string }[] = []

    for (const clusterArn of clusterArns) {
      const servicesResponse = await this.memoClient.send(new ListServicesCommand({ cluster: clusterArn }))
      for (const serviceArn of servicesResponse.serviceArns || []) {
        services.push({ clusterArn, serviceArn })
      }
    }

    return services
  }

  public readonly getMetadata = () => ({
    name: 'ECSFargateLatestPlatformVersion',
    description: 'Ensures ECS Fargate services are using the latest platform version.',
    priority: 3,
    priorityReason:
      'Using the latest platform version ensures access to the latest features, updates, and security patches.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Performance and Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListClustersCommand',
        reason: 'Retrieve ECS clusters to identify associated services.'
      },
      {
        name: 'ListServicesCommand',
        reason: 'Retrieve services associated with each ECS cluster.'
      },
      {
        name: 'DescribeServicesCommand',
        reason: 'Check the platform version of each ECS service.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateServiceCommand',
        reason: 'Update ECS services to use the latest platform version.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that updating to the latest platform version aligns with your workload requirements.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const services = await this.getServices()

    for (const { clusterArn, serviceArn } of services) {
      const serviceResponse = await this.memoClient.send(
        new DescribeServicesCommand({ cluster: clusterArn, services: [serviceArn] })
      )

      const service = serviceResponse.services?.[0]
      if (service?.platformVersion === 'LATEST') {
        compliantResources.push(service.serviceArn!)
      } else {
        if (service?.serviceArn) {
          nonCompliantResources.push(service.serviceArn)
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
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
