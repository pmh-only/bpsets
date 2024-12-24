import {
  ECRClient,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
  ListImagesCommand,
  BatchGetImageCommand,
  PutImageCommand,
  DeleteRepositoryCommand
} from '@aws-sdk/client-ecr'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECRKmsEncryption1 implements BPSet {
  private readonly client = new ECRClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getRepositories = async () => {
    const response = await this.memoClient.send(new DescribeRepositoriesCommand({}))
    return response.repositories || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const repositories = await this.getRepositories()

    for (const repository of repositories) {
      if (repository.encryptionConfiguration?.encryptionType === 'KMS') {
        compliantResources.push(repository.repositoryArn!)
      } else {
        nonCompliantResources.push(repository.repositoryArn!)
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
      const repositoryName = arn.split('/').pop()!

      // Create a new repository with KMS encryption
      const newRepositoryName = `${repositoryName}-kms`
      await this.client.send(
        new CreateRepositoryCommand({
          repositoryName: newRepositoryName,
          encryptionConfiguration: {
            encryptionType: 'KMS',
            kmsKey: kmsKeyId
          }
        })
      )

      // Get all images in the existing repository
      const listImagesResponse = await this.client.send(
        new ListImagesCommand({ repositoryName })
      )
      const imageIds = listImagesResponse.imageIds || []

      if (imageIds.length > 0) {
        const batchGetImageResponse = await this.client.send(
          new BatchGetImageCommand({ repositoryName, imageIds })
        )

        // Push images to the new repository
        for (const image of batchGetImageResponse.images || []) {
          await this.client.send(
            new PutImageCommand({
              repositoryName: newRepositoryName,
              imageManifest: image.imageManifest,
              imageTag: image.imageId?.imageTag
            })
          )
        }
      }

      // Delete the old repository
      await this.client.send(
        new DeleteRepositoryCommand({
          repositoryName,
          force: true
        })
      )
    }
  }
}
