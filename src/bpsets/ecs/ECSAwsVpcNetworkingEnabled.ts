import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSAwsVpcNetworkingEnabled implements BPSet {
  private readonly client = new ECSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTaskDefinitions = async () => {
    const taskDefinitionArns = await this.memoClient.send(new ListTaskDefinitionsCommand({ status: 'ACTIVE' }))
    const taskDefinitions = []
    for (const arn of taskDefinitionArns.taskDefinitionArns || []) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      taskDefinitions.push(taskDefinition.taskDefinition!)
    }
    return taskDefinitions
  }

  public readonly getMetadata = () => ({
    name: 'ECSAwsVpcNetworkingEnabled',
    description: 'Ensures that ECS task definitions are configured to use the awsvpc network mode.',
    priority: 3,
    priorityReason: 'Using the awsvpc network mode provides enhanced security and networking capabilities.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTaskDefinitionsCommand',
        reason: 'Retrieve all active ECS task definitions.'
      },
      {
        name: 'DescribeTaskDefinitionCommand',
        reason: 'Describe details of each ECS task definition.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterTaskDefinitionCommand',
        reason: 'Re-register ECS task definitions with awsvpc network mode.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure that the awsvpc network mode is supported by your ECS setup and compatible with your workloads.'
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
    const taskDefinitions = await this.getTaskDefinitions()

    for (const taskDefinition of taskDefinitions) {
      if (taskDefinition.networkMode === 'awsvpc') {
        compliantResources.push(taskDefinition.taskDefinitionArn!)
      } else {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!)
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
    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      const family = taskDefinition.taskDefinition?.family

      await this.client.send(
        new RegisterTaskDefinitionCommand({
          family,
          containerDefinitions: taskDefinition.taskDefinition?.containerDefinitions,
          networkMode: 'awsvpc',
          requiresCompatibilities: taskDefinition.taskDefinition?.requiresCompatibilities,
          cpu: taskDefinition.taskDefinition?.cpu,
          memory: taskDefinition.taskDefinition?.memory
        })
      )
    }
  }
}
