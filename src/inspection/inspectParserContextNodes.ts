// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CommonError, isNever, Option } from "../common";
import { Ast, NodeIdMap, ParserContext } from "../parser";
import { XorNodeKind } from "../parser/nodeIdMap";
import {
    addToScopeIfNew,
    csvContainerChildXorNodes,
    isParentOfNodeKind,
    isTokenPositionBeforePostiion,
    NodeKind,
    State,
} from "./common";
import { addAstToScopeIfNew } from "./inspectAstNodes";

export function inspectContextNode(state: State, node: ParserContext.Node): void {
    switch (node.kind) {
        case Ast.NodeKind.EachExpression: {
            addContextToScopeIfNew(state, "_", node);
            state.result.nodes.push({
                kind: NodeKind.Each,
                maybePositionStart: node.maybeTokenStart !== undefined ? node.maybeTokenStart.positionStart : undefined,
                maybePositionEnd: undefined,
            });
            break;
        }

        case Ast.NodeKind.Identifier:
            if (
                !isParentOfNodeKind(state.nodeIdMapCollection, node.id, Ast.NodeKind.IdentifierExpression) &&
                node.maybeAstNode
            ) {
                const identifier: Ast.Identifier = node.maybeAstNode as Ast.Identifier;
                addContextToScopeIfNew(state, identifier.literal, node);
            }
            break;

        case Ast.NodeKind.IdentifierExpression: {
            inspectIdentifierExpression(state, node);
            break;
        }

        case Ast.NodeKind.ListExpression:
        case Ast.NodeKind.ListLiteral: {
            state.result.nodes.push({
                kind: NodeKind.List,
                maybePositionStart: node.maybeTokenStart !== undefined ? node.maybeTokenStart.positionStart : undefined,
                maybePositionEnd: undefined,
            });
            break;
        }

        case Ast.NodeKind.RecordExpression:
        case Ast.NodeKind.RecordLiteral: {
            state.result.nodes.push({
                kind: NodeKind.Record,
                maybePositionStart: node.maybeTokenStart !== undefined ? node.maybeTokenStart.positionStart : undefined,
                maybePositionEnd: undefined,
            });

            for (const key of keysFromRecord(state.nodeIdMapCollection, node.id)) {
                if (isTokenPositionBeforePostiion(key.tokenRange.positionEnd, state.position)) {
                    addAstToScopeIfNew(state, key.literal, key);
                }
            }

            break;
        }

        case Ast.NodeKind.Section:
            break;

        default:
            break;
    }
}

// Returns all children for parent as TXorNodes.
function contextChildren(
    nodeIdMapCollection: NodeIdMap.Collection,
    parent: ParserContext.Node,
): ReadonlyArray<NodeIdMap.TXorNode> {
    const maybeChildIds: Option<ReadonlyArray<number>> = nodeIdMapCollection.childIdsById.get(parent.id);
    if (maybeChildIds === undefined) {
        return [];
    } else {
        const childIds: ReadonlyArray<number> = maybeChildIds;
        return NodeIdMap.expectXorNodes(nodeIdMapCollection, childIds);
    }
}

function addContextToScopeIfNew(state: State, key: string, contextNode: ParserContext.Node): void {
    addToScopeIfNew(state, key, {
        kind: XorNodeKind.Context,
        node: contextNode,
    });
}

// Returns all record keys (GeneralizedIdentifier) from a Record TXorNode.
function keysFromRecord(
    nodeIdMapCollection: NodeIdMap.Collection,
    parentId: number,
): ReadonlyArray<Ast.GeneralizedIdentifier> {
    // Try to grab the 2nd child (a CsvContainer) from parent (where the 1st child is the constant '[').
    const maybeCsvContainerXorNode: Option<NodeIdMap.TXorNode> = NodeIdMap.maybeNthChild(
        nodeIdMapCollection,
        parentId,
        1,
        Ast.NodeKind.ContainerHelper,
    );
    // No CsvContainer exists.
    if (maybeCsvContainerXorNode === undefined) {
        return [];
    }

    const csvContainerXorNode: NodeIdMap.TXorNode = maybeCsvContainerXorNode;
    const keys: Ast.GeneralizedIdentifier[] = [];

    // Iterate over all Ast.ICsv<_>.node
    for (const csvXorNode of csvContainerChildXorNodes(nodeIdMapCollection, csvContainerXorNode)) {
        switch (csvXorNode.kind) {
            // The child node is an Ast.TNode, which makes things way easier to logic out.
            case NodeIdMap.XorNodeKind.Ast: {
                const csvAstNode: Ast.TNode = csvXorNode.node;

                // Sanity check that we're matching the expected Ast.NodeKind.
                switch (csvAstNode.kind) {
                    case Ast.NodeKind.GeneralizedIdentifierPairedExpression:
                    case Ast.NodeKind.GeneralizedIdentifierPairedAnyLiteral:
                        keys.push(csvAstNode.key);
                        break;

                    default:
                        const details: {} = { csvXorNode };
                        throw new CommonError.InvariantError(
                            `csvXorNode can should only be either GeneralizedIdentifierPairedExpression or GeneralizedIdentifierPairedAnyLiteral`,
                            details,
                        );
                }
                break;
            }

            // The child is a ParserContext.Node, so more hack-y navigation.
            case NodeIdMap.XorNodeKind.Context: {
                // Starting from the Csv, try to perform a drilldown on the following path:
                //  * GeneralizedIdentifierPairedAnyLiteral or GeneralizedIdentifierPairedExpression
                //  * GeneralizedIdentifier
                const maybeKeyXorNode: Option<NodeIdMap.TXorNode> = NodeIdMap.maybeNthChild(
                    nodeIdMapCollection,
                    csvXorNode.node.id,
                    0,
                    Ast.NodeKind.GeneralizedIdentifier,
                );

                // The GeneralizedIdentifier TXorNode doesn't exist because it wasn't parsed.
                if (maybeKeyXorNode === undefined) {
                    break;
                }
                const keyXorNode: NodeIdMap.TXorNode = maybeKeyXorNode;

                // While the drill down returns a TXorNode we only care about the Ast.TNode case.
                if (keyXorNode.kind === NodeIdMap.XorNodeKind.Ast) {
                    // maybeXorNodeChildAtIndex ensured it's a GeneralizedIdentifier
                    keys.push(keyXorNode.node as Ast.GeneralizedIdentifier);
                }

                break;
            }

            default:
                throw isNever(csvXorNode);
        }
    }

    return keys;
}

function inspectIdentifierExpression(state: State, node: ParserContext.Node): void {
    let identifier: string = "";
    const children: ReadonlyArray<NodeIdMap.TXorNode> = contextChildren(state.nodeIdMapCollection, node);

    if (children.length === 1 || children.length === 2) {
        const firstChild: NodeIdMap.TXorNode = children[0];
        if (firstChild.kind === NodeIdMap.XorNodeKind.Ast) {
            switch (firstChild.node.kind) {
                // inclusive constant `@`
                case Ast.NodeKind.Constant:
                // no inclusive constant
                case Ast.NodeKind.Identifier:
                    identifier += firstChild.node.literal;
                    break;

                default:
                    const details: {} = { nodeKind: firstChild.node.kind };
                    throw new CommonError.InvariantError(`identifierExpression has invalid Ast.NodeKind`, details);
            }
        }
    }

    if (children.length === 2) {
        const secondChild: NodeIdMap.TXorNode = children[1];
        if (secondChild.kind === NodeIdMap.XorNodeKind.Ast) {
            if (secondChild.node.kind !== Ast.NodeKind.Identifier) {
                const details: {} = { nodeKind: secondChild.node.kind };
                throw new CommonError.InvariantError(`identifierExpression has invalid Ast.NodeKind`, details);
            }

            identifier += secondChild.node.literal;
        }
    }

    if (identifier.length) {
        addContextToScopeIfNew(state, identifier, node);
    }
}