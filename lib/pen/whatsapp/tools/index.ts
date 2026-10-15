// Every tool module, in the order their tools are shown to the model. One line per module.

import type { ToolModule } from './types'
import { confirmModule } from '../confirm'

export const MODULES: ToolModule[] = [confirmModule]
