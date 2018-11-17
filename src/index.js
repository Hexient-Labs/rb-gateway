require('dotenv').config()
const fetch = require('node-fetch')
const { HttpLink } = require('apollo-link-http')
const { ApolloServer } = require('apollo-server')
const {
  introspectSchema,
  makeRemoteExecutableSchema,
  mergeSchemas,
} = require('graphql-tools')

/**
 * @desc URIs for remote GraphQL APIs
 * @type {[*]}
 */
const REMOTE_SCHEMA_URIS = [
  process.env.GRAPHQL_CART_SERVICE_URI,
  process.env.GRAPHQL_CHECKOUT_SERVICE_URI,
  process.env.GRAPHQL_USER_SERVICE_URI,
]

/**
 * @desc Creates executable schemas from remote GraphQL APIs
 * @desc Runs introspection schemas on remote APIs
 * @param uris
 * @returns {Promise.<Array|*>}
 */
const createRemoteExecutableSchemas = async uris => {
  try {
    const links = uris.map(uri => new HttpLink({
      uri,
      fetch
    }))

    const remoteSchemaPromises = links.map(introspectSchema)
    const remoteSchemas = await Promise.all(remoteSchemaPromises)

    return remoteSchemas.map((schema, index) => makeRemoteExecutableSchema({
      schema,
      link: links[index]
    }))
  } catch (error) {
    console.log('Error creating remote executable schemas')
  }
}

/**
 * @desc Type defs linking the schemas together (for graph-like querying)
 * @type {string}
 */
const linkTypeDefs = `
  extend type User {
    cart: Cart!
    orders: [Order!]!
  }
`

/**
 * @desc Creates resolvers that link schemas together
 * @param schemas
 */
const createLinkResolvers = schemas => ({
  User: {
    cart: {
      fragment: `... on User { id }`,
      resolve(_, args, context, info) {
        return info.mergeInfo.delegateToSchema({
          schema: schemas[0],
          operation: 'query',
          fieldName: 'cartForCurrentUser',
          args,
          context,
          info,
        });
      }
    },
    orders: {
      fragment: `... on User { id }`,
      resolve(_, args, context, info) {
        return info.mergeInfo.delegateToSchema({
          schema: schemas[1],
          operation: 'query',
          fieldName: 'ordersForCurrentCustomer',
          args,
          context,
          info
        })
      }
    }
  }
})

/**
 * @desc Actually merge all executable schemas together
 * @param uris
 * @returns {Promise.<void>}
 */
const createNewSchema = async uris => {
  const schemas = await createRemoteExecutableSchemas(uris)
  return mergeSchemas({
    schemas: schemas.concat(linkTypeDefs),
    resolvers: createLinkResolvers(schemas)
  })
}

/**
 * @desc Runs the new merged server
 * @returns {Promise.<void>}
 */
const runServer = async () => {
  const schema = await createNewSchema(REMOTE_SCHEMA_URIS)

  const server = new ApolloServer({
    schema,
    introspection: true,
    playground: false,
  })

  server.listen({ port: process.env.PORT }).then(({ url }) => {
    console.log(`Eagles soaring high at ${url}`)
  })
}

try {
  runServer()
} catch (err) {
  console.error(err)
}
