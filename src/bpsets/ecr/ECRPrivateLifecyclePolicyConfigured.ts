import {
  ECRClient,
  DescribeRepositoriesCommand,
  PutLifecyclePolicyCommand,
  GetLifecyclePolicyCommand
} from '@aws-sdk/client-ecr'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECRPrivateLifecyclePolicyConfigured implements BPSet {
  private readonly client = new ECRClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getRepositories = async () => {
    const response = await this.memoClient.send(new DescribeRepositoriesCommand({}))
    return response.repositories || []
  }

  public readonly getMetadata = () => ({
    name: 'ECRPrivateLifecyclePolicyConfigured',
    description: 'Ensures that private ECR repositories have lifecycle policies configured.',
    priority: 3,
    priorityReason:
      'Lifecycle policies reduce unnecessary costs by managing image retention and cleanup in ECR repositories.',
    awsService: 'ECR',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Cost Optimization',
    requiredParametersForFix: [
      {
        name: 'lifecycle-policy',
        description: 'The JSON-formatted lifecycle policy text to apply to the repositories.',
        default: '',
        example:
          '{"rules":[{"rulePriority":1,"description":"Expire untagged images older than 30 days","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countNumber":30,"countUnit":"days"},"action":{"type":"expire"}}]}'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeRepositoriesCommand',
        reason: 'Retrieve all ECR repositories to check their lifecycle policy status.'
      },
      {
        name: 'GetLifecyclePolicyCommand',
        reason: 'Verify if a lifecycle policy exists for each repository.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutLifecyclePolicyCommand',
        reason: 'Apply a lifecycle policy to non-compliant ECR repositories.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the provided lifecycle policy is well-tested and does not inadvertently remove critical images.'
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
      try {
        await this.client.send(
          new GetLifecyclePolicyCommand({
            registryId: repository.registryId,
            repositoryName: repository.repositoryName
          })
        )
        compliantResources.push(repository.repositoryArn!)
      } catch (error: unknown) {
        if (error.name === 'LifecyclePolicyNotFoundException') {
          nonCompliantResources.push(repository.repositoryArn!)
        } else {
          throw error
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const lifecyclePolicy = requiredParametersForFix.find((param) => param.name === 'lifecycle-policy')?.value

    if (!lifecyclePolicy) {
      throw new Error("Required parameter 'lifecycle-policy' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const repositoryName = arn.split('/').pop()!

      await this.client.send(
        new PutLifecyclePolicyCommand({
          repositoryName,
          lifecyclePolicyText: lifecyclePolicy
        })
      )
    }
  }
}
