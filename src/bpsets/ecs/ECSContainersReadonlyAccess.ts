import {
  ECSClient,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
} from '@aws-sdk/client-ecs';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ECSContainersReadonlyAccess implements BPSet {
  private readonly client = new ECSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getTaskDefinitions = async () => {
    const taskDefinitionArns = await this.memoClient.send(
      new ListTaskDefinitionsCommand({ status: 'ACTIVE' })
    );
    const taskDefinitions = [];
    for (const arn of taskDefinitionArns.taskDefinitionArns || []) {
      const taskDefinition = await this.memoClient.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: arn })
      );
      taskDefinitions.push(taskDefinition.taskDefinition!);
    }
    return taskDefinitions;
  };

  public readonly getMetadata = () => ({
    name: 'ECSContainersReadonlyAccess',
    description: 'Ensures that containers in ECS task definitions have readonly root filesystems enabled.',
    priority: 1,
    priorityReason:
      'Readonly root filesystems prevent unauthorized changes to the container filesystem, enhancing security.',
    awsService: 'ECS',
    awsServiceCategory: 'Container',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTaskDefinitionsCommand',
        reason: 'Retrieve all active ECS task definitions.',
      },
      {
        name: 'DescribeTaskDefinitionCommand',
        reason: 'Check the container configurations in ECS task definitions.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterTaskDefinitionCommand',
        reason: 'Re-register ECS task definitions with readonly root filesystems enabled.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure enabling readonly root filesystems does not interfere with the functionality of your containers.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const taskDefinitions = await this.getTaskDefinitions();

    for (const taskDefinition of taskDefinitions) {
      const notReadonlyContainers = taskDefinition.containerDefinitions?.filter(
        (container) => !container.readonlyRootFilesystem
      );
      if (notReadonlyContainers?.length) {
        nonCompliantResources.push(taskDefinition.taskDefinitionArn!);
      } else {
        compliantResources.push(taskDefinition.taskDefinitionArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const taskDefinition = await this.memoClient.send(
        new DescribeTaskDefinitionCommand({ taskDefinition: arn })
      );
      const family = taskDefinition.taskDefinition?.family;

      const updatedContainers = taskDefinition.taskDefinition?.containerDefinitions?.map(
        (container) => ({
          ...container,
          readonlyRootFilesystem: true,
        })
      );

      await this.client.send(
        new RegisterTaskDefinitionCommand({
          family,
          containerDefinitions: updatedContainers,
          networkMode: taskDefinition.taskDefinition?.networkMode,
          requiresCompatibilities: taskDefinition.taskDefinition?.requiresCompatibilities,
          cpu: taskDefinition.taskDefinition?.cpu,
          memory: taskDefinition.taskDefinition?.memory,
        })
      );
    }
  };
}
