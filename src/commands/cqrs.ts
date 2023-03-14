import { GluegunToolbox } from 'gluegun'
import {
  Project,
  StructureKind,
  SyntaxKind,
  VariableDeclarationKind,
} from 'ts-morph'
import { parse } from 'path'

module.exports = {
  // TODO: export subcommand nestjs:cqrs
  name: 'cqrs',
  alias: [],
  run: async (toolbox: GluegunToolbox) => {
    const {
      parameters,
      print: {},
      prompt,
      strings,
    } = toolbox

    // TODO: check nest-cli.json + parse object

    let name = parameters.first

    if (!name) {
      const result = await prompt.ask({
        type: 'input',
        name: 'name',
        message: 'What is the name of the Query/Command?',
      })
      if (result && result.name) name = result.name
    }

    let queryOrCommand = parameters.second
    if (!queryOrCommand) {
      const result = await prompt.ask({
        type: 'select',
        name: 'queryOrCommand',
        message: 'Query or Command?',
        choices: ['query', 'command'],
      })
      if (result && result.queryOrCommand)
        queryOrCommand = result.queryOrCommand
    }

    // TODO: get module name from folder
    let moduleName = 'admin'
    //   tsConfigFilePath: "path/to/tsconfig.json",
    const project = new Project({})
    const folder = strings.pluralize(queryOrCommand)

    // create *.query|command.ts cqrs
    const { cqrsClassName, cqrsFileName } = createCQRSClass(
      name,
      queryOrCommand,
      project,
      folder,
      toolbox
    )

    // create *.handler.ts cqrs
    const { handlerClassName, handlerFileName } = createHandlerClass(
      name,
      project,
      folder,
      cqrsClassName,
      cqrsFileName,
      toolbox,
      queryOrCommand
    )

    // export handler
    addHandlerToIndexClass(
      project,
      folder,
      moduleName,
      queryOrCommand,
      handlerClassName,
      handlerFileName,
      toolbox
    )

    await project.save()
  },
}

function addHandlerToIndexClass(
  project: Project,
  folder: string,
  moduleName: string,
  queryOrCommand: string,
  handlerClassName: string,
  handlerFileName: string,
  toolbox: GluegunToolbox
) {
  const { print, strings } = toolbox
  const { info } = print
  const { pascalCase } = strings

  const indexFilename = 'index.ts'
  // TODO: workaround until load tsconfig
  project.addSourceFileAtPathIfExists(`${folder}/${indexFilename}`)
  let indexClass = project.getSourceFile(`${folder}/${indexFilename}`)
  // create class if it doesn't exist
  if (!indexClass) {
    indexClass = project.createSourceFile(`${folder}/${indexFilename}`, {
      statements: [
        {
          kind: StructureKind.VariableStatement,
          declarationKind: VariableDeclarationKind.Const,
          isExported: true,
          // TODO: Add async
          declarations: [
            {
              name: className(
                [moduleName, queryOrCommand, 'Handlers'],
                pascalCase
              ),
              initializer: '[]',
            },
          ],
        },
      ],
    })
  }

  // add handler to exported array
  const exportedHandlersVar = indexClass.getVariableDeclaration((s) =>
    s.hasExportKeyword()
  )
  const exportedHandlers = exportedHandlersVar.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression
  )
  exportedHandlers.addElement(handlerClassName)

  indexClass.addImportDeclarations([
    {
      moduleSpecifier: `./${parse(handlerFileName).name}`,
      namedImports: [handlerClassName],
    },
  ])

  info(`${print.checkmark} Generated class ${indexFilename}`)
}

function createHandlerClass(
  name: string,
  project: Project,
  folder: string,
  cqrsClassName: string,
  cqrsFileName: string,
  toolbox: GluegunToolbox,
  queryOrCommand: string
) {
  const { print, strings } = toolbox
  const { info } = print
  const { kebabCase, pascalCase } = strings

  const handlerFileName = `${kebabCase(name)}.handler.ts`
  const handlerClassName = className([name, 'Handler'], pascalCase)
  //TODO: create something like path but to join class names -> conventionfactory
  const handlerClass = project.createSourceFile(
    `${folder}/${handlerFileName}`,
    {
      statements: [
        {
          kind: StructureKind.Class,
          name: handlerClassName,
          implements: [
            className(['I', queryOrCommand, 'Handler'], pascalCase).concat(
              '<',
              cqrsClassName,
              '>'
            ),
          ],
          isExported: true,

          methods: [
            {
              name: 'execute',
              parameters: [{ name: queryOrCommand, type: cqrsClassName }],
              isAsync: true,
            },
          ],
          ctors: [{}],

          // TODO: use nestjs exported definitions
          decorators: [
            {
              name: className([queryOrCommand, 'Handler'], pascalCase),
              arguments: [cqrsClassName],
            },
          ],
        },
      ],
    }
  )

  handlerClass.addImportDeclarations([
    {
      moduleSpecifier: '@nestjs/cqrs',
      namedImports: [
        className([queryOrCommand, 'Handler'], pascalCase),
        className(['I', queryOrCommand, 'Handler'], pascalCase),
      ],
    },
    {
      //TODO: use source specifier
      moduleSpecifier: `./${parse(cqrsFileName).name}`,
      namedImports: [cqrsClassName],
    },
  ])
  info(`${print.checkmark} Generated class ${handlerFileName}`)

  return { handlerClassName, handlerFileName }
}

function createCQRSClass(
  name: string,
  queryOrCommand: string,
  project: Project,
  folder: string,
  toolbox: GluegunToolbox
) {
  const { print, strings } = toolbox
  const { info } = print
  const { kebabCase, pascalCase } = strings

  const cqrsFileName = `${kebabCase(name)}.${queryOrCommand}.ts`
  const cqrsClassName = className([name, queryOrCommand], pascalCase)
  const operationClass = project.createSourceFile(`${folder}/${cqrsFileName}`, {
    statements: [
      {
        kind: StructureKind.Class,
        name: cqrsClassName,
        implements: [className(['I', queryOrCommand], pascalCase)],
        isExported: true,
        ctors: [{}],
      },
    ],
  })

  operationClass.addImportDeclaration({
    moduleSpecifier: '@nestjs/cqrs',
    namedImports: [className(['I', queryOrCommand], pascalCase)],
  })

  info(`${print.checkmark} Generated class ${cqrsFileName}`)
  return { cqrsClassName, cqrsFileName }
}
function className(args: string[], pascalCase: (value: string) => string) {
  return args.map(pascalCase).join('')
}
