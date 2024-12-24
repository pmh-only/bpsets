import {
  SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand
} from '@aws-sdk/client-sns'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class SNSEncryptedKMS implements BPSet {
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
    const topics = await this.getTopics() as any

    for (const topic of topics) {
      if (topic.KmsMasterKeyId) {
        compliantResources.push(topic.TopicArn!)
      } else {
        nonCompliantResources.push(topic.TopicArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'kms-key-id', value: '<KMS_KEY_ID>' }]
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
      await this.client.send(
        new SetTopicAttributesCommand({
          TopicArn: arn,
          AttributeName: 'KmsMasterKeyId',
          AttributeValue: kmsKeyId
        })
      )
    }
  }
}
