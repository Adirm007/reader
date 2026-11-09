/** Defines window.ReaderUI. Loaded in the reader controller before legacy-reader.js; it does nothing on its
 *  own — source/reader-ui-switch.js (after controller-adapter.js) hands it the lobby when the switch is on. */
import { createReaderUI } from './reader-ui';

(window as unknown as { ReaderUI?: unknown }).ReaderUI = createReaderUI();
