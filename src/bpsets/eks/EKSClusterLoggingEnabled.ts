import { EKSClient, ListClustersCommand, DescribeClusterCommand, UpdateClusterConfigCommand } from '@aws-sdk/client-eks'
import { BPSet, BPSetStats, BPSetFixFn } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EKSClusterLoggingEnabled implements BPSet {
  private readonly client = new EKSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getClusters = async () => {
    const clusterNamesResponse = await this.memoClient.send(new ListClustersCommand({}))
    const clusterNames = clusterNamesResponse.clusters || []
    const clusters = []
    for (const clusterName of clusterNames) {
      const cluster = await this.memoClient.send(new DescribeClusterCommand({ name: clusterName }))
      clusters.push(cluster.cluster!)
    }
    return clusters
  }

  public readonly getMetadata = () => ({
    name: 'EKSClusterLoggingEnabled',
    description: 'Ensures that all EKS clusters have full logging enabled.',
    priority: 1,
    priorityReason: 'Cluster logging is essential for monitoring, debugging, and auditing purposes.',
    awsService: 'EKS',
    awsServiceCategory: 'Kubernetes Service',
    bestPracticeCategory: 'Observability',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListClustersCommand',
        reason: 'Retrieve the list of EKS clusters.'
      },
      {
        name: 'DescribeClusterCommand',
        reason: 'Fetch details about the EKS cluster, including logging configuration.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateClusterConfigCommand',
        reason: 'Enable all logging types for the EKS cluster.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that enabling full logging does not generate excessive costs or logs.'
  })

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
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
    const clusters = await this.getClusters()

    for (const cluster of clusters) {
      const clusterLogging = cluster.logging?.clusterLogging?.[0]
      if (clusterLogging?.enabled && clusterLogging.types?.length === 5) {
        compliantResources.push(cluster.arn!)
      } else {
        nonCompliantResources.push(cluster.arn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (nonCompliantResources) => {
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
