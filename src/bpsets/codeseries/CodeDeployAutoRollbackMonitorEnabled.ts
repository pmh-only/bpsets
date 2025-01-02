import {
  CodeDeployClient,
  ListApplicationsCommand,
  ListDeploymentGroupsCommand,
  BatchGetDeploymentGroupsCommand,
  UpdateDeploymentGroupCommand,
} from '@aws-sdk/client-codedeploy';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class CodeDeployAutoRollbackMonitorEnabled implements BPSet {
  private readonly client = new CodeDeployClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getDeploymentGroups = async () => {
    const applications = await this.memoClient.send(new ListApplicationsCommand({}));
    const deploymentGroupsInfo = [];

    for (const application of applications.applications || []) {
      const deploymentGroups = await this.memoClient.send(
        new ListDeploymentGroupsCommand({ applicationName: application })
      );
      if (!deploymentGroups.deploymentGroups?.length) {
        continue;
      }
      const batchResponse = await this.memoClient.send(
        new BatchGetDeploymentGroupsCommand({
          applicationName: application,
          deploymentGroupNames: deploymentGroups.deploymentGroups,
        })
      );
      deploymentGroupsInfo.push(...(batchResponse.deploymentGroupsInfo || []));
    }

    return deploymentGroupsInfo;
  };

  public readonly getMetadata = () => ({
    name: 'CodeDeployAutoRollbackMonitorEnabled',
    description: 'Ensures that auto-rollback and alarm monitoring are enabled for CodeDeploy deployment groups.',
    priority: 2,
    priorityReason: 'Enabling auto-rollback and alarms helps prevent deployment issues and allows for automated recovery.',
    awsService: 'CodeDeploy',
    awsServiceCategory: 'Deployment',
    bestPracticeCategory: 'Resilience',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListApplicationsCommand',
        reason: 'Retrieve all CodeDeploy applications to analyze their deployment groups.',
      },
      {
        name: 'ListDeploymentGroupsCommand',
        reason: 'Fetch deployment groups for each application.',
      },
      {
        name: 'BatchGetDeploymentGroupsCommand',
        reason: 'Get detailed information about deployment groups to check configurations.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDeploymentGroupCommand',
        reason: 'Enable alarm monitoring and auto-rollback configurations for deployment groups.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure your alarms and configurations align with organizational standards before enabling auto-rollback and monitoring.',
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
    const deploymentGroups = await this.getDeploymentGroups();

    for (const deploymentGroup of deploymentGroups) {
      if (
        deploymentGroup.alarmConfiguration?.enabled &&
        deploymentGroup.autoRollbackConfiguration?.enabled
      ) {
        compliantResources.push(deploymentGroup.deploymentGroupId!);
      } else {
        nonCompliantResources.push(deploymentGroup.deploymentGroupId!);
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
    const deploymentGroups = await this.getDeploymentGroups();

    for (const groupId of nonCompliantResources) {
      const deploymentGroupToFix = deploymentGroups.find(
        (group) => group.deploymentGroupId === groupId
      );

      if (!deploymentGroupToFix) {
        continue;
      }

      await this.client.send(
        new UpdateDeploymentGroupCommand({
          applicationName: deploymentGroupToFix.applicationName!,
          currentDeploymentGroupName: deploymentGroupToFix.deploymentGroupName!,
          alarmConfiguration: {
            ...deploymentGroupToFix.alarmConfiguration,
            enabled: true,
          },
          autoRollbackConfiguration: {
            ...deploymentGroupToFix.autoRollbackConfiguration,
            enabled: true,
          },
        })
      );
    }
  };
}
