import { GluegunCommand } from 'gluegun'

const command: GluegunCommand = {
  name: 'fml',
  run: async (toolbox) => {
    const { print } = toolbox

    print.info('FML')
  },
}

module.exports = command
