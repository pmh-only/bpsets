import {
  ApiGatewayV2Client,
  GetApisCommand,
  GetRoutesCommand,
  UpdateRouteCommand
} from '@aws-sdk/client-apigatewayv2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class APIGatewayV2AuthorizationTypeConfigured implements BPSet {
  private readonly client = new ApiGatewayV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getHttpApis = async () => {
    const response = await this.memoClient.send(new GetApisCommand({}))
    return response.Items || []
  }

  private readonly getRoutes = async (apiId: string) => {
    const response = await this.memoClient.send(new GetRoutesCommand({ ApiId: apiId }))
    return response.Items || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const apis = await this.getHttpApis()

    for (const api of apis) {
      const routes = await this.getRoutes(api.ApiId!)
      for (const route of routes) {
        const routeIdentifier = `${api.Name!} / ${route.RouteKey!}`
        if (route.AuthorizationType === 'NONE') {
          nonCompliantResources.push(routeIdentifier)
        } else {
          compliantResources.push(routeIdentifier)
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'authorization-type' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const authorizationType = requiredParametersForFix.find(param => param.name === 'authorization-type')?.value

    if (!authorizationType) {
      throw new Error("Required parameter 'authorization-type' is missing.")
    }

    for (const resource of nonCompliantResources) {
      const [apiName, routeKey] = resource.split(' / ')
      const api = (await this.getHttpApis()).find(a => a.Name === apiName)

      if (!api) continue

      const routes = await this.getRoutes(api.ApiId!)
      const route = routes.find(r => r.RouteKey === routeKey)

      if (!route) continue

      await this.client.send(
        new UpdateRouteCommand({
          ApiId: api.ApiId!,
          RouteId: route.RouteId!, // Use RouteId instead of RouteKey
          AuthorizationType: authorizationType as any
        })
      )
    }
  }
}
