import { EKSClient, ListClustersCommand, DescribeClusterCommand, UpdateClusterConfigCommand } from '@aws-sdk/client-eks'
import { BPSet, BPSetStats, BPSetFixFn } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EKSEndpointNoPublicAccess implements BPSet {
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
    name: 'EKSEndpointNoPublicAccess',
    description: 'Ensures EKS cluster endpoint does not have public access enabled.',
    priority: 1,
    priorityReason:
      'Disabling public access to the cluster endpoint enhances security by limiting exposure to public networks.',
    awsService: 'EKS',
    awsServiceCategory: 'Kubernetes Service',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListClustersCommand',
        reason: 'Retrieves the list of EKS clusters.'
      },
      {
        name: 'DescribeClusterCommand',
        reason: 'Fetches detailed configuration of each EKS cluster.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateClusterConfigCommand',
        reason: 'Updates the EKS cluster configuration to disable public endpoint access.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the private endpoint is properly configured and accessible before disabling public access.'
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
      const endpointPublicAccess = cluster.resourcesVpcConfig?.endpointPublicAccess
      if (endpointPublicAccess) {
        nonCompliantResources.push(cluster.arn!)
      } else {
        compliantResources.push(cluster.arn!)
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
          resourcesVpcConfig: {
            endpointPublicAccess: false
          }
        })
      )
    }
  }
}
