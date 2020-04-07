// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CommonError, Result, ResultKind, ResultUtils } from "../../common";
import { Ast, NodeIdMap, NodeIdMapIterator, NodeIdMapUtils, TXorNode } from "../../parser";
import { CommonSettings } from "../../settings";
import { TypeInspector, TypeUtils } from "../../type";
import {
    KeyValuePairScopeItem2,
    ParameterScopeItem2,
    ScopeItemKind2,
    SectionMemberScopeItem2,
    TScopeItem2,
} from "./scopeItem2";

export type TriedScopeInspection = Result<ScopeById, CommonError.CommonError>;

export type TriedNodeScopeInspection = Result<ScopeItemByKey, CommonError.CommonError>;

export type ScopeById = Map<number, ScopeItemByKey>;

export type ScopeItemByKey = Map<string, TScopeItem2>;

export function tryInspectScope2(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    rootId: number,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: undefined | ScopeById,
): TriedScopeInspection {
    let scopeById: ScopeById;
    if (maybeScopeById !== undefined) {
        const maybeCached: undefined | ScopeItemByKey = maybeScopeById.get(rootId);
        if (maybeCached !== undefined) {
            return ResultUtils.okFactory(maybeScopeById);
        }
        scopeById = maybeScopeById;
    } else {
        scopeById = new Map();
    }

    // Store the delta between the given scope and what's found in a temporary map.
    // This will prevent mutation in the given map if an error is thrown.
    const scopeChanges: ScopeById = new Map();
    const ancestry: ReadonlyArray<TXorNode> = NodeIdMapIterator.expectAncestry(nodeIdMapCollection, rootId);
    const state: ScopeInspectionState = {
        settings,
        givenScope: scopeById,
        deltaScope: scopeChanges,
        ancestry,
        nodeIdMapCollection,
        leafNodeIds,
        ancestryIndex: 0,
    };

    try {
        // Build up the scope through a top-down inspection.
        const numNodes: number = ancestry.length;
        for (let ancestryIndex: number = numNodes - 1; ancestryIndex >= 0; ancestryIndex -= 1) {
            state.ancestryIndex = ancestryIndex;
            const xorNode: TXorNode = ancestry[ancestryIndex];

            inspectNode(state, xorNode);
        }

        return ResultUtils.okFactory(state.deltaScope);
    } catch (err) {
        return {
            kind: ResultKind.Err,
            error: CommonError.ensureCommonError(state.settings.localizationTemplates, err),
        };
    }
}

export function tryInspectScope2ForNode(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    nodeId: number,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: undefined | ScopeById,
): TriedNodeScopeInspection {
    const triedScopeInspection: TriedScopeInspection = tryInspectScope2(
        settings,
        nodeIdMapCollection,
        leafNodeIds,
        nodeId,
        maybeScopeById,
    );

    if (ResultUtils.isErr(triedScopeInspection)) {
        return triedScopeInspection;
    }

    const maybeScope: undefined | ScopeItemByKey = triedScopeInspection.value.get(nodeId);
    if (maybeScope === undefined) {
        const details: {} = { nodeId };
        throw new CommonError.InvariantError(
            `${tryInspectScope2ForNode.name}: expected nodeId in ${tryInspectScope2.name} result`,
            details,
        );
    }

    return ResultUtils.okFactory(maybeScope);
}

interface ScopeInspectionState {
    readonly settings: CommonSettings;
    readonly givenScope: ScopeById;
    readonly deltaScope: ScopeById;
    readonly ancestry: ReadonlyArray<TXorNode>;
    readonly nodeIdMapCollection: NodeIdMap.Collection;
    readonly leafNodeIds: ReadonlyArray<number>;
    ancestryIndex: number;
}

function inspectNode(state: ScopeInspectionState, xorNode: TXorNode): void {
    switch (xorNode.node.kind) {
        case Ast.NodeKind.EachExpression:
            inspectEachExpression(state, xorNode);
            break;

        case Ast.NodeKind.FunctionExpression:
            inspectFunctionExpression(state, xorNode);
            break;

        case Ast.NodeKind.LetExpression:
            inspectLetExpression(state, xorNode);
            break;

        case Ast.NodeKind.RecordExpression:
        case Ast.NodeKind.RecordLiteral:
            inspectRecordExpressionOrRecordLiteral(state, xorNode);
            break;

        case Ast.NodeKind.Section:
            inspectSection(state, xorNode);
            break;

        default:
            getOrCreateScope(state, xorNode.node.id, undefined);
            break;
    }
}

function inspectEachExpression(state: ScopeInspectionState, eachExpr: TXorNode): void {
    const maybeErr: undefined | CommonError.InvariantError = NodeIdMapUtils.testAstNodeKind(
        eachExpr,
        Ast.NodeKind.EachExpression,
    );
    if (maybeErr) {
        throw maybeErr;
    }

    expandChildScope(
        state,
        eachExpr,
        [1],
        [
            [
                "_",
                {
                    kind: ScopeItemKind2.Each,
                    eachExpression: eachExpr,
                },
            ],
        ],
        undefined,
    );
}

function inspectFunctionExpression(state: ScopeInspectionState, fnExpr: TXorNode): void {
    const maybeErr: undefined | CommonError.InvariantError = NodeIdMapUtils.testAstNodeKind(
        fnExpr,
        Ast.NodeKind.FunctionExpression,
    );
    if (maybeErr) {
        throw maybeErr;
    }

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = getOrCreateScope(state, fnExpr.node.id, undefined);

    const inspectedFnExpr: TypeInspector.InspectedFunctionExpression = TypeInspector.inspectFunctionExpression(
        state.nodeIdMapCollection,
        fnExpr,
    );

    const newEntries: ReadonlyArray<[string, ParameterScopeItem2]> = inspectedFnExpr.parameters.map(
        (parameter: TypeInspector.InspectedFunctionParameter) => {
            return [
                parameter.name.literal,
                {
                    kind: ScopeItemKind2.Parameter,
                    name: parameter.name,
                    isOptional: parameter.isOptional,
                    isNullable: parameter.isNullable,
                    maybeType:
                        parameter.maybeType !== undefined
                            ? TypeUtils.maybePrimitiveTypeConstantKindFromTypeKind(parameter.maybeType)
                            : undefined,
                },
            ];
        },
    );
    expandChildScope(state, fnExpr, [3], newEntries, scope);
}

function inspectLetExpression(state: ScopeInspectionState, letExpr: TXorNode): void {
    const maybeErr: undefined | CommonError.InvariantError = NodeIdMapUtils.testAstNodeKind(
        letExpr,
        Ast.NodeKind.LetExpression,
    );
    if (maybeErr) {
        throw maybeErr;
    }

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = getOrCreateScope(state, letExpr.node.id, undefined);

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<
        Ast.Identifier
    >> = NodeIdMapIterator.letKeyValuePairs(state.nodeIdMapCollection, letExpr);
    const newEntries: ReadonlyArray<[string, KeyValuePairScopeItem2]> = inspectKeyValuePairs(
        state,
        scope,
        keyValuePairs,
    );
    expandChildScope(state, letExpr, [3], newEntries, scope);
}

// If position is to the right of an equals sign,
// then add all keys to scope EXCEPT for the one the that position is under.
function inspectRecordExpressionOrRecordLiteral(state: ScopeInspectionState, record: TXorNode): void {
    const maybeErr: undefined | CommonError.InvariantError = NodeIdMapUtils.testAstAnyNodeKind(record, [
        Ast.NodeKind.RecordExpression,
        Ast.NodeKind.RecordLiteral,
    ]);
    if (maybeErr) {
        throw maybeErr;
    }

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = getOrCreateScope(state, record.node.id, undefined);

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<
        Ast.GeneralizedIdentifier
    >> = NodeIdMapIterator.recordKeyValuePairs(state.nodeIdMapCollection, record);
    inspectKeyValuePairs(state, scope, keyValuePairs);
}

function inspectSection(state: ScopeInspectionState, section: TXorNode): void {
    const maybeErr: undefined | CommonError.InvariantError = NodeIdMapUtils.testAstNodeKind(
        section,
        Ast.NodeKind.Section,
    );
    if (maybeErr) {
        throw maybeErr;
    }

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<
        Ast.Identifier
    >> = NodeIdMapIterator.sectionMemberKeyValuePairs(state.nodeIdMapCollection, section);
    const unfilteredNewEntries: ReadonlyArray<[string, SectionMemberScopeItem2]> = keyValuePairs.map(
        (kvp: NodeIdMapIterator.KeyValuePair<Ast.Identifier>) => {
            return [
                kvp.key.literal,
                {
                    kind: ScopeItemKind2.SectionMember,
                    key: kvp.key,
                    maybeValue: kvp.maybeValue,
                },
            ];
        },
    );

    for (const kvp of keyValuePairs) {
        if (kvp.maybeValue === undefined) {
            continue;
        }

        const filteredNewEntries: ReadonlyArray<[string, SectionMemberScopeItem2]> = unfilteredNewEntries.filter(
            (pair: [string, SectionMemberScopeItem2]) => {
                return pair[1].key.id !== kvp.key.id;
            },
        );
        expandScope(state, kvp.maybeValue, filteredNewEntries, new Map());
    }
}

function inspectKeyValuePairs<T>(
    state: ScopeInspectionState,
    parentScope: ScopeItemByKey,
    keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<T>>,
): ReadonlyArray<[string, KeyValuePairScopeItem2]> {
    const unfilteredNewEntries: ReadonlyArray<[string, KeyValuePairScopeItem2]> = keyValuePairs.map(
        (kvp: NodeIdMapIterator.KeyValuePair<T>) => {
            return [
                kvp.key.literal,
                {
                    kind: ScopeItemKind2.KeyValuePair,
                    key: kvp.key,
                    maybeValue: kvp.maybeValue,
                },
            ];
        },
    );

    for (const kvp of keyValuePairs) {
        if (kvp.maybeValue === undefined) {
            continue;
        }

        const filteredNewEntries: ReadonlyArray<[string, KeyValuePairScopeItem2]> = unfilteredNewEntries.filter(
            (pair: [string, KeyValuePairScopeItem2]) => {
                return pair[1].key.id !== kvp.key.id;
            },
        );
        expandScope(state, kvp.maybeValue, filteredNewEntries, parentScope);
    }

    return unfilteredNewEntries;
}

function expandScope(
    state: ScopeInspectionState,
    xorNode: TXorNode,
    newEntries: ReadonlyArray<[string, TScopeItem2]>,
    maybeDefaultScope: undefined | ScopeItemByKey,
): void {
    const scope: ScopeItemByKey = getOrCreateScope(state, xorNode.node.id, maybeDefaultScope);
    for (const [key, value] of newEntries) {
        scope.set(key, value);
    }
}

function expandChildScope(
    state: ScopeInspectionState,
    parent: TXorNode,
    childAttributeIds: ReadonlyArray<number>,
    newEntries: ReadonlyArray<[string, TScopeItem2]>,
    maybeDefaultScope: undefined | ScopeItemByKey,
): void {
    const nodeIdMapCollection: NodeIdMap.Collection = state.nodeIdMapCollection;
    const parentId: number = parent.node.id;

    // TODO: optimize this
    for (const attributeId of childAttributeIds) {
        const maybeChild: undefined | TXorNode = NodeIdMapUtils.maybeXorChildByAttributeIndex(
            nodeIdMapCollection,
            parentId,
            attributeId,
            undefined,
        );
        if (maybeChild !== undefined) {
            expandScope(state, maybeChild, newEntries, maybeDefaultScope);
        }
    }
}

// Any operation done on a scope should first invoke `scopeFor` for data integrity.
function getOrCreateScope(
    state: ScopeInspectionState,
    nodeId: number,
    maybeDefaultScope: undefined | ScopeItemByKey,
): ScopeItemByKey {
    // If scopeFor has already been called then there should be a nodeId in the deltaScope.
    const maybeDeltaScope: undefined | ScopeItemByKey = state.deltaScope.get(nodeId);
    if (maybeDeltaScope !== undefined) {
        return maybeDeltaScope;
    }

    // If given a scope with an existing value then assume it's valid.
    // Cache and return.
    const maybeGivenScope: undefined | ScopeItemByKey = state.givenScope.get(nodeId);
    if (maybeGivenScope !== undefined) {
        state.deltaScope.set(nodeId, { ...maybeGivenScope });
        return maybeGivenScope;
    }

    if (maybeDefaultScope !== undefined) {
        const shallowCopy: ScopeItemByKey = new Map(maybeDefaultScope.entries());
        state.deltaScope.set(nodeId, shallowCopy);
        return shallowCopy;
    }

    // Default to a parent's scope if the node has a parent.
    const maybeParent: undefined | TXorNode = NodeIdMapUtils.maybeParentXorNode(
        state.nodeIdMapCollection,
        nodeId,
        undefined,
    );
    if (maybeParent !== undefined) {
        const parentNodeId: number = maybeParent.node.id;

        const maybeParentDeltaScope: undefined | ScopeItemByKey = state.deltaScope.get(parentNodeId);
        if (maybeParentDeltaScope !== undefined) {
            const shallowCopy: ScopeItemByKey = new Map(maybeParentDeltaScope.entries());
            state.deltaScope.set(nodeId, shallowCopy);
            return shallowCopy;
        }

        const maybeParentGivenScope: undefined | ScopeItemByKey = state.givenScope.get(parentNodeId);
        if (maybeParentGivenScope !== undefined) {
            const shallowCopy: ScopeItemByKey = new Map(maybeParentGivenScope.entries());
            state.deltaScope.set(nodeId, shallowCopy);
            return shallowCopy;
        }
    }

    // The node has no parent or it hasn't been visited.
    const newScope: ScopeItemByKey = new Map();
    state.deltaScope.set(nodeId, newScope);
    return newScope;
}
