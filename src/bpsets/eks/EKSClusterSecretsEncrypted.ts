import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
  AssociateEncryptionConfigCommand
} from '@aws-sdk/client-eks'
import { BPSet, BPSetStats, BPSetFixFn } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EKSClusterSecretsEncrypted implements BPSet {
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
    name: 'EKSClusterSecretsEncrypted',
    description: 'Ensures that all EKS clusters have secrets encrypted with a KMS key.',
    priority: 1,
    priorityReason: 'Encrypting secrets ensures the security and compliance of sensitive data in EKS clusters.',
    awsService: 'EKS',
    awsServiceCategory: 'Kubernetes Service',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'The KMS key ARN to enable encryption for EKS secrets.',
        default: '',
        example: 'arn:aws:kms:us-east-1:123456789012:key/example-key-id'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListClustersCommand',
        reason: 'Retrieve the list of EKS clusters.'
      },
      {
        name: 'DescribeClusterCommand',
        reason: 'Fetch details about the EKS cluster, including encryption configuration.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'AssociateEncryptionConfigCommand',
        reason: 'Enable encryption for EKS secrets using the provided KMS key.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the specified KMS key is accessible to the EKS service and cluster.'
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
      const encryptionConfig = cluster.encryptionConfig?.[0]
      if (encryptionConfig?.resources?.includes('secrets')) {
        compliantResources.push(cluster.arn!)
      } else {
        nonCompliantResources.push(cluster.arn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const clusterName = arn.split(':cluster/')[1]

      await this.client.send(
        new AssociateEncryptionConfigCommand({
          clusterName,
          encryptionConfig: [
            {
              resources: ['secrets'],
              provider: { keyArn: kmsKeyId }
            }
          ]
        })
      )
    }
  }
}
