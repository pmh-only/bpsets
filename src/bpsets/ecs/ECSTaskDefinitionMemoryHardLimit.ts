import {
  ECSClient,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand
} from '@aws-sdk/client-ecs'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ECSTaskDefinitionMemoryHardLimit implements BPSet {
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
    name: 'ECSTaskDefinitionMemoryHardLimit',
    description: 'Ensures all containers in ECS task definitions have a memory hard limit set.',
    priority: 1,
    priorityReason:
      'Setting memory hard limits is essential to prevent resource contention and ensure container isolation.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Resource Management',
    requiredParametersForFix: [
      {
        name: 'default-memory-limit',
        description: 'The default memory hard limit to set for containers without a memory limit.',
        default: '512',
        example: '1024'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTaskDefinitionsCommand',
        reason: 'Retrieve all active ECS task definitions.'
      },
      {
        name: 'DescribeTaskDefinitionCommand',
        reason: 'Check container configurations in ECS task definitions for memory limits.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterTaskDefinitionCommand',
        reason: 'Re-register ECS task definitions with updated memory limits.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the default memory limit aligns with your container resource requirements.'
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
      const containersWithoutMemoryLimit = taskDefinition.containerDefinitions?.filter((container) => !container.memory)
      if (containersWithoutMemoryLimit?.length) {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!)
      } else {
        compliantResources.push(taskDefinition.taskDefinitionArn!)
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
    const defaultMemoryLimit = parseInt(
      requiredParametersForFix.find((param) => param.name === 'default-memory-limit')?.value || '512',
      10
    )

    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }))
      const family = taskDefinition.taskDefinition?.family

      const updatedContainers = taskDefinition.taskDefinition?.containerDefinitions?.map((container) => ({
        ...container,
        memory: container.memory || defaultMemoryLimit
      }))

      await this.client.send(
        new RegisterTaskDefinitionCommand({
          family,
          containerDefinitions: updatedContainers,
          networkMode: taskDefinition.taskDefinition?.networkMode,
          requiresCompatibilities: taskDefinition.taskDefinition?.requiresCompatibilities,
          cpu: taskDefinition.taskDefinition?.cpu,
          memory: taskDefinition.taskDefinition?.memory
        })
      )
    }
  }
}
