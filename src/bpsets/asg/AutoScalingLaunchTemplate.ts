import { AutoScalingClient, DescribeAutoScalingGroupsCommand, UpdateAutoScalingGroupCommand } from '@aws-sdk/client-auto-scaling'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class AutoScalingLaunchTemplate implements BPSet {
  private readonly client = new AutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAutoScalingGroups = async () => {
    const response = await this.memoClient.send(new DescribeAutoScalingGroupsCommand({}))
    return response.AutoScalingGroups || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const asgs = await this.getAutoScalingGroups()

    for (const asg of asgs) {
      if (asg.LaunchConfigurationName) {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        compliantResources.push(asg.AutoScalingGroupARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'launch-template-id' }, { name: 'version' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const launchTemplateId = requiredParametersForFix.find(param => param.name === 'launch-template-id')?.value
    const version = requiredParametersForFix.find(param => param.name === 'version')?.value

    if (!launchTemplateId || !version) {
      throw new Error("Required parameters 'launch-template-id' and/or 'version' are missing.")
    }

    for (const asgArn of nonCompliantResources) {
      const asgName = asgArn.split(':').pop()!
      await this.client.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: asgName,
          LaunchTemplate: {
            LaunchTemplateId: launchTemplateId,
            Version: version
          }
        })
      )
    }
  }
}
