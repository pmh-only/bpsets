import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
  AssociateEncryptionConfigCommand
} from '@aws-sdk/client-eks'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class EKSClusterSecretsEncrypted implements BPSet {
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
      const encryptionConfig = cluster.encryptionConfig?.[0]
      if (encryptionConfig?.resources?.includes('secrets')) {
        compliantResources.push(cluster.arn!)
      } else {
        nonCompliantResources.push(cluster.arn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'kms-key-id' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const kmsKeyId = requiredParametersForFix.find(param => param.name === 'kms-key-id')?.value

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
