import {
  ECRClient,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
  ListImagesCommand,
  BatchGetImageCommand,
  PutImageCommand,
  DeleteRepositoryCommand
} from '@aws-sdk/client-ecr'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECRKmsEncryption1 implements BPSet {
  private readonly client = new ECRClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getRepositories = async () => {
    const response = await this.memoClient.send(new DescribeRepositoriesCommand({}))
    return response.repositories || []
  }

  public readonly getMetadata = () => ({
    name: 'ECRKmsEncryption1',
    description: 'Ensures ECR repositories are encrypted using AWS KMS.',
    priority: 2,
    priorityReason: 'Encrypting ECR repositories with KMS enhances data security and meets compliance requirements.',
    awsService: 'ECR',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'The ID of the KMS key used to encrypt the ECR repository.',
        default: '',
        example: 'arn:aws:kms:us-east-1:123456789012:key/abcd1234-5678-90ef-ghij-klmnopqrstuv'
      }
    ],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeRepositoriesCommand',
        reason: 'Retrieve the list of ECR repositories to verify encryption settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'CreateRepositoryCommand',
        reason: 'Create a new repository with KMS encryption.'
      },
      {
        name: 'ListImagesCommand',
        reason: 'List all images in the existing repository for migration.'
      },
      {
        name: 'BatchGetImageCommand',
        reason: 'Retrieve image manifests for migration to the new repository.'
      },
      {
        name: 'PutImageCommand',
        reason: 'Push images to the newly created repository.'
      },
      {
        name: 'DeleteRepositoryCommand',
        reason: 'Delete the old repository after migration.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the specified KMS key is accessible, and deleting the old repository aligns with operational policies.'
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
    const repositories = await this.getRepositories()

    for (const repository of repositories) {
      if (repository.encryptionConfiguration?.encryptionType === 'KMS') {
        compliantResources.push(repository.repositoryArn!)
      } else {
        nonCompliantResources.push(repository.repositoryArn!)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value

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
      const listImagesResponse = await this.client.send(new ListImagesCommand({ repositoryName }))
      const imageIds = listImagesResponse.imageIds || []

      if (imageIds.length > 0) {
        const batchGetImageResponse = await this.client.send(new BatchGetImageCommand({ repositoryName, imageIds }))

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
