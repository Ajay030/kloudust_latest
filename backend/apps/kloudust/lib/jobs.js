/**
 * Runs Kloudust jobs. Uses queue executor from Monkshu.
 * (C) 2023 Tekmonks Corp.
 * License: See enclosed LICENSE file.
 */

const monkshubridge = require(`${KLOUD_CONSTANTS.LIBDIR}/monkshubridge.js`);

let queueexecutor;

/** Inits the module */
exports.initAsync = async _ => {
    queueexecutor = await monkshubridge.initMonkshuGlobalAndGetModuleAsync("queueExecutor");
    queueexecutor.init();
}

/**
 * Run the given function as a queued task.
 * @param {function} functionToCall The function to call.
 * @param {array} params The parameters to the function. 
 * @param {boolean} isAsync Optional: Is it an async function, default is no.
 * @param {number} delay Optional: The delay after execution of the previous
 *                       task before executing this function. Default is 0.
 * @param {function} callback An optional callback to call once the task 
 *                            has been executed. If isAsync is true and a callback
 *                            is not provided, then a promise is returned which is 
 *                            resolved when the queueExecutor finally executes the task.
 * @return  If the function to call is async and a callback is not provided, then the
 *          promise which resolves when it has been exectued, else nothing.
 */
exports.add = (functionToCall, params=[], isAsync=false, delay=0, callback) => {
    queueexecutor.add(functionToCall, params, isAsync, delay, _=>callback);
}
    

/** @return true if jobs queue is empty else false */
exports.isQueueEmpty = _ => queueexecutor.getQueueDepth() == 0;