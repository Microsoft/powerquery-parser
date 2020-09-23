// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Assert, CommonError, Result, ResultUtils } from "../../common";
import { Ast, Type, TypeInspector, TypeUtils } from "../../language";
import { LocalizationUtils } from "../../localization";
import {
    AncestryUtils,
    NodeIdMap,
    NodeIdMapIterator,
    NodeIdMapUtils,
    TXorNode,
    XorNodeKind,
    XorNodeUtils,
} from "../../parser";
import { CommonSettings } from "../../settings";
import {
    KeyValuePairScopeItem,
    ParameterScopeItem,
    ScopeItemKind,
    SectionMemberScopeItem,
    TScopeItem,
} from "./scopeItem";

export type ScopeTypeByKey = Map<string, Type.TType>;

export type TriedScope = Result<ScopeById, CommonError.CommonError>;

export type TriedScopeForRoot = Result<ScopeItemByKey, CommonError.CommonError>;

export type ScopeById = Map<number, ScopeItemByKey>;

export type ScopeItemByKey = Map<string, TScopeItem>;

export function tryScope(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    ancestry: ReadonlyArray<TXorNode>,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: ScopeById | undefined,
): TriedScope {
    return ResultUtils.ensureResult(LocalizationUtils.getLocalizationTemplates(settings.locale), () =>
        inspectScope(settings, nodeIdMapCollection, leafNodeIds, ancestry, maybeScopeById),
    );
}

export function tryScopeItems(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    nodeId: number,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: ScopeById | undefined,
): TriedScopeForRoot {
    return ResultUtils.ensureResult(LocalizationUtils.getLocalizationTemplates(settings.locale), () => {
        const ancestry: ReadonlyArray<TXorNode> = AncestryUtils.assertGetAncestry(nodeIdMapCollection, nodeId);
        if (ancestry.length === 0) {
            return new Map();
        }

        const inspected: ScopeById = inspectScope(settings, nodeIdMapCollection, leafNodeIds, ancestry, maybeScopeById);
        const maybeScope: ScopeItemByKey | undefined = inspected.get(nodeId);
        Assert.isDefined(maybeScope, `expected nodeId in scope result`, { nodeId });

        return maybeScope;
    });
}

export function getOrCreateScopeItemByKey(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    nodeId: number,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: ScopeById | undefined = undefined,
): Result<ScopeItemByKey, CommonError.CommonError> {
    const scopeById: ScopeById = maybeScopeById ?? new Map();
    const maybeScope: ScopeItemByKey | undefined = scopeById.get(nodeId);
    if (maybeScope !== undefined) {
        return ResultUtils.okFactory(maybeScope);
    }

    const triedScope: TriedScopeForRoot = tryScopeItems(settings, nodeIdMapCollection, leafNodeIds, nodeId, scopeById);
    if (ResultUtils.isErr(triedScope)) {
        throw triedScope.error;
    }

    return triedScope;
}

export function maybeDereferencedIdentifier(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    xorNode: TXorNode,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: ScopeById | undefined = undefined,
): Result<TXorNode | undefined, CommonError.CommonError> {
    XorNodeUtils.assertAnyAstNodeKind(xorNode, [Ast.NodeKind.Identifier, Ast.NodeKind.IdentifierExpression]);
    const scopeById: ScopeById = maybeScopeById ?? new Map();

    if (xorNode.kind === XorNodeKind.Context) {
        return ResultUtils.okFactory(undefined);
    }
    const identifier: Ast.Identifier | Ast.IdentifierExpression = xorNode.node as
        | Ast.Identifier
        | Ast.IdentifierExpression;

    let identifierLiteral: string;
    let isIdentifierRecurisve: boolean;

    switch (identifier.kind) {
        case Ast.NodeKind.Identifier:
            identifierLiteral = identifier.literal;
            isIdentifierRecurisve = false;
            break;

        case Ast.NodeKind.IdentifierExpression:
            identifierLiteral = identifier.identifier.literal;
            isIdentifierRecurisve = identifier.maybeInclusiveConstant !== undefined;
            break;

        default:
            throw Assert.isNever(identifier);
    }

    const triedScopeItemByKey: Result<ScopeItemByKey, CommonError.CommonError> = getOrCreateScopeItemByKey(
        settings,
        nodeIdMapCollection,
        leafNodeIds,
        xorNode.node.id,
        scopeById,
    );
    if (ResultUtils.isErr(triedScopeItemByKey)) {
        return triedScopeItemByKey;
    }
    const scopeItemByKey: ScopeItemByKey = triedScopeItemByKey.value;
    const maybeScopeItem: undefined | TScopeItem = scopeItemByKey.get(identifierLiteral);

    if (
        // If the identifier couldn't be found in the generated scope,
        // then either the scope generation is incorrect or it's an external identifier.
        maybeScopeItem?.isRecursive !== isIdentifierRecurisve
    ) {
        return ResultUtils.okFactory(undefined);
    }
    const scopeItem: TScopeItem = maybeScopeItem;

    let maybeNextXorNode: undefined | TXorNode;
    switch (scopeItem.kind) {
        case ScopeItemKind.Each:
        case ScopeItemKind.Parameter:
        case ScopeItemKind.Undefined:
            break;

        case ScopeItemKind.KeyValuePair:
            maybeNextXorNode = scopeItem.maybeValue;
            break;

        case ScopeItemKind.SectionMember:
            maybeNextXorNode = scopeItem.maybeValue;
            break;

        default:
            throw Assert.isNever(scopeItem);
    }

    if (maybeNextXorNode === undefined) {
        return ResultUtils.okFactory(xorNode);
    } else if (
        maybeNextXorNode.kind !== XorNodeKind.Ast ||
        (maybeNextXorNode.node.kind !== Ast.NodeKind.Identifier &&
            maybeNextXorNode.node.kind !== Ast.NodeKind.IdentifierExpression)
    ) {
        return ResultUtils.okFactory(xorNode);
    } else {
        return maybeDereferencedIdentifier(settings, nodeIdMapCollection, leafNodeIds, maybeNextXorNode, scopeById);
    }
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

function inspectScope(
    settings: CommonSettings,
    nodeIdMapCollection: NodeIdMap.Collection,
    leafNodeIds: ReadonlyArray<number>,
    ancestry: ReadonlyArray<TXorNode>,
    // If a map is given, then it's mutated and returned. Else create and return a new instance.
    maybeScopeById: ScopeById | undefined,
): ScopeById {
    const rootId: number = ancestry[0].node.id;

    let scopeById: ScopeById;
    if (maybeScopeById !== undefined) {
        const maybeCached: ScopeItemByKey | undefined = maybeScopeById.get(rootId);
        if (maybeCached !== undefined) {
            return maybeScopeById;
        }
        scopeById = maybeScopeById;
    } else {
        scopeById = new Map();
    }

    // Store the delta between the given scope and what's found in a temporary map.
    // This will prevent mutation in the given map if an error is thrown.
    const scopeChanges: ScopeById = new Map();
    const state: ScopeInspectionState = {
        settings,
        givenScope: scopeById,
        deltaScope: scopeChanges,
        ancestry,
        nodeIdMapCollection,
        leafNodeIds,
        ancestryIndex: 0,
    };

    // Build up the scope through a top-down inspection.
    const numNodes: number = ancestry.length;
    for (let ancestryIndex: number = numNodes - 1; ancestryIndex >= 0; ancestryIndex -= 1) {
        state.ancestryIndex = ancestryIndex;
        const xorNode: TXorNode = ancestry[ancestryIndex];

        inspectNode(state, xorNode);
    }

    return state.deltaScope;
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
            localGetOrCreateScope(state, xorNode.node.id, undefined);
    }
}

function inspectEachExpression(state: ScopeInspectionState, eachExpr: TXorNode): void {
    XorNodeUtils.assertAstNodeKind(eachExpr, Ast.NodeKind.EachExpression);
    expandChildScope(
        state,
        eachExpr,
        [1],
        [
            [
                "_",
                {
                    kind: ScopeItemKind.Each,
                    id: eachExpr.node.id,
                    isRecursive: false,
                    eachExpression: eachExpr,
                },
            ],
        ],
        undefined,
    );
}

function inspectFunctionExpression(state: ScopeInspectionState, fnExpr: TXorNode): void {
    XorNodeUtils.assertAstNodeKind(fnExpr, Ast.NodeKind.FunctionExpression);

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = localGetOrCreateScope(state, fnExpr.node.id, undefined);

    const inspectedFnExpr: TypeInspector.InspectedFunctionExpression = TypeInspector.inspectFunctionExpression(
        state.nodeIdMapCollection,
        fnExpr,
    );

    const newEntries: ReadonlyArray<[string, ParameterScopeItem]> = inspectedFnExpr.parameters.map(
        (parameter: TypeInspector.InspectedFunctionParameter) => {
            return [
                parameter.name,
                {
                    kind: ScopeItemKind.Parameter,
                    id: parameter.id,
                    isRecursive: false,
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
    XorNodeUtils.assertAstNodeKind(letExpr, Ast.NodeKind.LetExpression);

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = localGetOrCreateScope(state, letExpr.node.id, undefined);

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<
        Ast.Identifier
    >> = NodeIdMapIterator.iterLetExpression(state.nodeIdMapCollection, letExpr);

    inspectKeyValuePairs(state, scope, keyValuePairs, keyValuePairScopeItemFactory);

    // Places the assignments from the 'let' into LetExpression.expression
    const newEntries: ReadonlyArray<[string, KeyValuePairScopeItem]> = scopeItemsFromKeyValuePairs(
        keyValuePairs,
        -1,
        keyValuePairScopeItemFactory,
    );
    expandChildScope(state, letExpr, [3], newEntries, scope);
}

function inspectRecordExpressionOrRecordLiteral(state: ScopeInspectionState, record: TXorNode): void {
    XorNodeUtils.assertAnyAstNodeKind(record, [Ast.NodeKind.RecordExpression, Ast.NodeKind.RecordLiteral]);

    // Propegates the parent's scope.
    const scope: ScopeItemByKey = localGetOrCreateScope(state, record.node.id, undefined);

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<
        Ast.GeneralizedIdentifier
    >> = NodeIdMapIterator.iterRecord(state.nodeIdMapCollection, record);
    inspectKeyValuePairs(state, scope, keyValuePairs, keyValuePairScopeItemFactory);
}

function inspectSection(state: ScopeInspectionState, section: TXorNode): void {
    XorNodeUtils.assertAstNodeKind(section, Ast.NodeKind.Section);

    const keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<Ast.Identifier>> = NodeIdMapIterator.iterSection(
        state.nodeIdMapCollection,
        section,
    );

    for (const kvp of keyValuePairs) {
        if (kvp.maybeValue === undefined) {
            continue;
        }

        const newScopeItems: ReadonlyArray<[string, SectionMemberScopeItem]> = scopeItemsFromKeyValuePairs(
            keyValuePairs,
            kvp.key.id,
            sectionMemberScopeItemFactory,
        );
        if (newScopeItems.length !== 0) {
            expandScope(state, kvp.maybeValue, newScopeItems, new Map());
        }
    }
}

// Expands the scope of the value portion for each key value pair.
function inspectKeyValuePairs<T extends TScopeItem, I extends Ast.GeneralizedIdentifier | Ast.Identifier>(
    state: ScopeInspectionState,
    parentScope: ScopeItemByKey,
    keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<I>>,
    factoryFn: (keyValuePair: NodeIdMapIterator.KeyValuePair<I>, recursive: boolean) => T,
): void {
    for (const kvp of keyValuePairs) {
        if (kvp.maybeValue === undefined) {
            continue;
        }

        const newScopeItems: ReadonlyArray<[string, T]> = scopeItemsFromKeyValuePairs(
            keyValuePairs,
            kvp.key.id,
            factoryFn,
        );
        if (newScopeItems.length !== 0) {
            expandScope(state, kvp.maybeValue, newScopeItems, parentScope);
        }
    }
}

function expandScope(
    state: ScopeInspectionState,
    xorNode: TXorNode,
    newEntries: ReadonlyArray<[string, TScopeItem]>,
    maybeDefaultScope: ScopeItemByKey | undefined,
): void {
    const scope: ScopeItemByKey = localGetOrCreateScope(state, xorNode.node.id, maybeDefaultScope);
    for (const [key, value] of newEntries) {
        scope.set(key, value);
    }
}

function expandChildScope(
    state: ScopeInspectionState,
    parent: TXorNode,
    childAttributeIds: ReadonlyArray<number>,
    newEntries: ReadonlyArray<[string, TScopeItem]>,
    maybeDefaultScope: ScopeItemByKey | undefined,
): void {
    const nodeIdMapCollection: NodeIdMap.Collection = state.nodeIdMapCollection;
    const parentId: number = parent.node.id;

    // TODO: optimize this
    for (const attributeId of childAttributeIds) {
        const maybeChild: TXorNode | undefined = NodeIdMapUtils.maybeChildXorByAttributeIndex(
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
function localGetOrCreateScope(
    state: ScopeInspectionState,
    nodeId: number,
    maybeDefaultScope: ScopeItemByKey | undefined,
): ScopeItemByKey {
    // If scopeFor has already been called then there should be a nodeId in the deltaScope.
    const maybeDeltaScope: ScopeItemByKey | undefined = state.deltaScope.get(nodeId);
    if (maybeDeltaScope !== undefined) {
        return maybeDeltaScope;
    }

    // If given a scope with an existing value then assume it's valid.
    // Cache and return.
    const maybeGivenScope: ScopeItemByKey | undefined = state.givenScope.get(nodeId);
    if (maybeGivenScope !== undefined) {
        const shallowCopy: ScopeItemByKey = new Map(maybeGivenScope.entries());
        state.deltaScope.set(nodeId, shallowCopy);
        return shallowCopy;
    }

    if (maybeDefaultScope !== undefined) {
        const shallowCopy: ScopeItemByKey = new Map(maybeDefaultScope.entries());
        state.deltaScope.set(nodeId, shallowCopy);
        return shallowCopy;
    }

    // Default to a parent's scope if the node has a parent.
    const maybeParent: TXorNode | undefined = NodeIdMapUtils.maybeParentXor(
        state.nodeIdMapCollection,
        nodeId,
        undefined,
    );
    if (maybeParent !== undefined) {
        const parentNodeId: number = maybeParent.node.id;

        const maybeParentDeltaScope: ScopeItemByKey | undefined = state.deltaScope.get(parentNodeId);
        if (maybeParentDeltaScope !== undefined) {
            const shallowCopy: ScopeItemByKey = new Map(maybeParentDeltaScope.entries());
            state.deltaScope.set(nodeId, shallowCopy);
            return shallowCopy;
        }

        const maybeParentGivenScope: ScopeItemByKey | undefined = state.givenScope.get(parentNodeId);
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

function scopeItemsFromKeyValuePairs<T extends TScopeItem, I extends Ast.Identifier | Ast.GeneralizedIdentifier>(
    keyValuePairs: ReadonlyArray<NodeIdMapIterator.KeyValuePair<I>>,
    ancestorKeyNodeId: number,
    factoryFn: (keyValuePair: NodeIdMapIterator.KeyValuePair<I>, isRecursive: boolean) => T,
): ReadonlyArray<[string, T]> {
    return keyValuePairs
        .filter((keyValuePair: NodeIdMapIterator.KeyValuePair<I>) => keyValuePair.maybeValue !== undefined)
        .map((keyValuePair: NodeIdMapIterator.KeyValuePair<I>) => {
            return [keyValuePair.keyLiteral, factoryFn(keyValuePair, ancestorKeyNodeId === keyValuePair.key.id)];
        });
}

function sectionMemberScopeItemFactory(
    keyValuePair: NodeIdMapIterator.KeyValuePair<Ast.Identifier>,
    isRecursive: boolean,
): SectionMemberScopeItem {
    return {
        kind: ScopeItemKind.SectionMember,
        id: keyValuePair.source.node.id,
        isRecursive,
        key: keyValuePair.key,
        maybeValue: keyValuePair.maybeValue,
    };
}

function keyValuePairScopeItemFactory<T extends Ast.Identifier | Ast.GeneralizedIdentifier>(
    keyValuePair: NodeIdMapIterator.KeyValuePair<T>,
    isRecursive: boolean,
): KeyValuePairScopeItem {
    return {
        kind: ScopeItemKind.KeyValuePair,
        id: keyValuePair.source.node.id,
        isRecursive,
        key: keyValuePair.key,
        maybeValue: keyValuePair.maybeValue,
    };
}
