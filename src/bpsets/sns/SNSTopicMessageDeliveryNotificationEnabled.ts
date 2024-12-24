import {
  SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand
} from '@aws-sdk/client-sns'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SNSTopicMessageDeliveryNotificationEnabled implements BPSet {
  private readonly client = new SNSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTopics = async () => {
    const topicsResponse = await this.memoClient.send(new ListTopicsCommand({}))
    const topics = topicsResponse.Topics || []

    const topicDetails = []
    for (const topic of topics) {
      const attributes = await this.memoClient.send(
        new GetTopicAttributesCommand({ TopicArn: topic.TopicArn! })
      )
      topicDetails.push({ ...attributes.Attributes, TopicArn: topic.TopicArn! })
    }

    return topicDetails
  }

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const topics = await this.getTopics()

    for (const topic of topics) {
      const feedbackRoles = Object.keys(topic).filter(key => key.endsWith('FeedbackRoleArn'))

      if (feedbackRoles.length > 0) {
        compliantResources.push(topic.TopicArn!)
      } else {
        nonCompliantResources.push(topic.TopicArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'sns-feedback-role-arn', value: '<FEEDBACK_ROLE_ARN>' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const feedbackRoleArn = requiredParametersForFix.find(
      param => param.name === 'sns-feedback-role-arn'
    )?.value

    if (!feedbackRoleArn) {
      throw new Error("Required parameter 'sns-feedback-role-arn' is missing.")
    }

    for (const arn of nonCompliantResources) {
      await this.client.send(
        new SetTopicAttributesCommand({
          TopicArn: arn,
          AttributeName: 'DeliveryPolicy',
          AttributeValue: JSON.stringify({
            http: {
              DefaultFeedbackRoleArn: feedbackRoleArn
            }
          })
        })
      )
    }
  }
}
