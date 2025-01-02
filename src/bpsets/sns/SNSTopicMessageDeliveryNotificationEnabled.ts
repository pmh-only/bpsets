import {
  SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
} from '@aws-sdk/client-sns';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class SNSTopicMessageDeliveryNotificationEnabled implements BPSet {
  private readonly client = new SNSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SNSTopicMessageDeliveryNotificationEnabled',
    description: 'Ensures that SNS topics have message delivery notifications enabled.',
    priority: 2,
    priorityReason: 'Message delivery notifications are essential for monitoring message deliveries.',
    awsService: 'SNS',
    awsServiceCategory: 'Messaging',
    bestPracticeCategory: 'Monitoring',
    requiredParametersForFix: [
      {
        name: 'sns-feedback-role-arn',
        description: 'The ARN of the IAM role to be used for feedback notifications.',
        default: '',
        example: 'arn:aws:iam::123456789012:role/SNSFeedbackRole',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTopicsCommand',
        reason: 'Lists all SNS topics in the account.',
      },
      {
        name: 'GetTopicAttributesCommand',
        reason: 'Retrieves attributes for each SNS topic to check for feedback roles.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'SetTopicAttributesCommand',
        reason: 'Enables message delivery notifications by setting the DeliveryPolicy attribute.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure the IAM role specified in the fix has the necessary permissions for SNS delivery notifications.',
  });

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const topics = await this.getTopics();

    for (const topic of topics) {
      const feedbackRoles = Object.keys(topic).filter((key) =>
        key.endsWith('FeedbackRoleArn')
      );

      if (feedbackRoles.length > 0) {
        compliantResources.push(topic.TopicArn!);
      } else {
        nonCompliantResources.push(topic.TopicArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const feedbackRoleArn = requiredParametersForFix.find(
      (param) => param.name === 'sns-feedback-role-arn'
    )?.value;

    if (!feedbackRoleArn) {
      throw new Error("Required parameter 'sns-feedback-role-arn' is missing.");
    }

    for (const arn of nonCompliantResources) {
      await this.client.send(
        new SetTopicAttributesCommand({
          TopicArn: arn,
          AttributeName: 'DeliveryPolicy',
          AttributeValue: JSON.stringify({
            http: {
              DefaultFeedbackRoleArn: feedbackRoleArn,
            },
          }),
        })
      );
    }
  };

  private readonly getTopics = async () => {
    const topicsResponse = await this.memoClient.send(new ListTopicsCommand({}));
    const topics = topicsResponse.Topics || [];

    const topicDetails = [];
    for (const topic of topics) {
      const attributes = await this.memoClient.send(
        new GetTopicAttributesCommand({ TopicArn: topic.TopicArn! })
      );
      topicDetails.push({ ...attributes.Attributes, TopicArn: topic.TopicArn! });
    }

    return topicDetails;
  };
}
