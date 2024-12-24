import {
  CodeDeployClient,
  ListApplicationsCommand,
  ListDeploymentGroupsCommand,
  BatchGetDeploymentGroupsCommand,
  UpdateDeploymentGroupCommand
} from '@aws-sdk/client-codedeploy'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class CodeDeployAutoRollbackMonitorEnabled implements BPSet {
  private readonly client = new CodeDeployClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDeploymentGroups = async () => {
    const applications = await this.memoClient.send(new ListApplicationsCommand({}))
    const deploymentGroupsInfo = []

    for (const application of applications.applications || []) {
      const deploymentGroups = await this.memoClient.send(
        new ListDeploymentGroupsCommand({ applicationName: application })
      )
      if (!deploymentGroups.deploymentGroups?.length) {
        continue
      }
      const batchResponse = await this.memoClient.send(
        new BatchGetDeploymentGroupsCommand({
          applicationName: application,
          deploymentGroupNames: deploymentGroups.deploymentGroups
        })
      )
      deploymentGroupsInfo.push(...(batchResponse.deploymentGroupsInfo || []))
    }

    return deploymentGroupsInfo
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const deploymentGroups = await this.getDeploymentGroups()

    for (const deploymentGroup of deploymentGroups) {
      if (
        deploymentGroup.alarmConfiguration?.enabled &&
        deploymentGroup.autoRollbackConfiguration?.enabled
      ) {
        compliantResources.push(deploymentGroup.deploymentGroupId!)
      } else {
        nonCompliantResources.push(deploymentGroup.deploymentGroupId!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const groupId of nonCompliantResources) {
      const deploymentGroups = await this.getDeploymentGroups()
      const deploymentGroupToFix = deploymentGroups.find(
        group => group.deploymentGroupId === groupId
      )

      if (!deploymentGroupToFix) {
        continue
      }

      await this.client.send(
        new UpdateDeploymentGroupCommand({
          applicationName: deploymentGroupToFix.applicationName!,
          currentDeploymentGroupName: deploymentGroupToFix.deploymentGroupName!,
          alarmConfiguration: {
            ...deploymentGroupToFix.alarmConfiguration,
            enabled: true
          },
          autoRollbackConfiguration: {
            ...deploymentGroupToFix.autoRollbackConfiguration,
            enabled: true
          }
        })
      )
    }
  }
}
