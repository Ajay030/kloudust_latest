/**
 * Role manager.
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

import {session} from "/framework/js/session.mjs";

/**
 * Filters a role list. A role list format is 
 *  {role_1: [_objects_allowed_1], ..., role_x: _one_object_allowed_x, ..., role_n: [_objects_allowed_n]}
 * @param {Array} rolelist The role list to filter for the current role
 * @returns Returns all objects from the list which are allowed for the current role
 */
function filterRoleList(rolelist) {
    const currentRole = session.get(APP_CONSTANTS.LOGGEDIN_USEROLE).toString(), 
        _asArray = object => Array.isArray(object) ? object : [object];
    const retlist = []; for (const [role, value] of Object.entries(rolelist)) {
        if (role.toLocaleLowerCase() == currentRole.toLocaleLowerCase()) retlist.push(..._asArray(value));
        if (role.trim().startsWith("!") && role.toLocaleLowerCase().trim() != `!${currentRole.toLocaleLowerCase()}`) 
            retlist.push(..._asArray(value));
        if (role.trim() == "*") retlist.push(..._asArray(value));
    }
    return retlist;
}

export const rolemanager = {filterRoleList};