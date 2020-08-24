// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { NodeIdMap, NodeIdMapIterator, XorNodeUtils } from ".";
import { ParseContext } from "..";
import { Language } from "../..";
import { ArrayUtils, Assert, CommonError, MapUtils, TypeScriptUtils } from "../../common";
import { Ast } from "../../language";
import { AstNodeById, Collection, ContextNodeById } from "./nodeIdMap";
import { TXorNode, XorNodeKind, XorNodeTokenRange } from "./xorNode";

// Contains at least one parsed token.
export function hasParsedToken(nodeIdMapCollection: Collection, nodeId: number): boolean {
    let maybeChildIds: ReadonlyArray<number> | undefined = nodeIdMapCollection.childIdsById.get(nodeId);

    while (maybeChildIds !== undefined) {
        const numChildren: number = maybeChildIds.length;

        // No children means no nothing was parsed under this node.
        if (numChildren === 0) {
            return false;
        }
        // There might be a child under here.
        else if (numChildren === 1) {
            const childId: number = maybeChildIds[0];
            // We know it's an Ast Node, therefore something was parsed.
            if (nodeIdMapCollection.astNodeById.has(childId)) {
                return true;
            }
            // There still might be a child under here. Recurse down to the grandchildren.
            else {
                maybeChildIds = nodeIdMapCollection.childIdsById.get(childId);
            }
        }
        // Handles the 'else if (numChildren > 2)' branch.
        // A Context should never have more than one open Context node at a time,
        // meaning there must be at least one Ast node under here.
        else {
            return true;
        }
    }

    return false;
}

export function xorNodeTokenRange(nodeIdMapCollection: Collection, xorNode: TXorNode): XorNodeTokenRange {
    switch (xorNode.kind) {
        case XorNodeKind.Ast: {
            const tokenRange: Language.TokenRange = xorNode.node.tokenRange;
            return {
                tokenIndexStart: tokenRange.tokenIndexStart,
                tokenIndexEnd: tokenRange.tokenIndexEnd,
            };
        }

        case XorNodeKind.Context: {
            const contextNode: ParseContext.Node = xorNode.node;
            let tokenIndexEnd: number;

            const maybeRightMostChild: Ast.TNode | undefined = maybeRightMostLeaf(nodeIdMapCollection, xorNode.node.id);
            if (maybeRightMostChild === undefined) {
                tokenIndexEnd = contextNode.tokenIndexStart;
            } else {
                const rightMostChild: Ast.TNode = maybeRightMostChild;
                tokenIndexEnd = rightMostChild.tokenRange.tokenIndexEnd;
            }

            return {
                tokenIndexStart: contextNode.tokenIndexStart,
                tokenIndexEnd,
            };
        }

        default:
            throw Assert.isNever(xorNode);
    }
}

// ------------------------------------
// -------- Derefence Helpers  --------
// ------------------------------------

export function maybeWrappedContentAst(
    nodeIdMapCollection: Collection,
    wrapped: TXorNode,
    maybeChildNodeKind: Ast.NodeKind,
): Ast.TNode | undefined {
    const maybeAst: TXorNode | undefined = maybeChildXorByAttributeIndex(nodeIdMapCollection, wrapped.node.id, 1, [
        maybeChildNodeKind,
    ]);
    return maybeAst?.kind === XorNodeKind.Ast ? maybeAst.node : undefined;
}

export function maybeCsv(nodeIdMapCollection: Collection, csv: TXorNode): TXorNode | undefined {
    return maybeChildXorByAttributeIndex(nodeIdMapCollection, csv.node.id, 0, undefined);
}

export function maybeArrayWrapperContent(nodeIdMapCollection: Collection, wrapped: TXorNode): TXorNode | undefined {
    return maybeChildXorByAttributeIndex(nodeIdMapCollection, wrapped.node.id, 1, [Ast.NodeKind.ArrayWrapper]);
}

export function maybeWrappedContent(
    nodeIdMapCollection: Collection,
    wrapped: TXorNode,
    maybeChildNodeKind: Ast.NodeKind,
): TXorNode | undefined {
    return maybeChildXorByAttributeIndex(nodeIdMapCollection, wrapped.node.id, 1, [maybeChildNodeKind]);
}

// -----------------------------
// -------- ID Helpers  --------
// -----------------------------

// Returns a map of `oldId -> newId` which follows the ID ordering invariant,
// expected to be consumed by updateNodeIds.
// Used to restore the nodeId ordering invariant after manual mangling of the Ast.
export function recalculateIds(nodeIdMapCollection: NodeIdMap.Collection, nodeStart: TXorNode): Map<number, number> {
    const visitedXorNodes: TXorNode[] = [];
    const nodeIds: number[] = [];

    let nodeStack: TXorNode[] = [];
    let currentNode: TXorNode | undefined = nodeStart;
    while (currentNode !== undefined) {
        nodeIds.push(currentNode.node.id);
        visitedXorNodes.push(currentNode);

        const childrenOfCurrentNode: ReadonlyArray<TXorNode> = NodeIdMapIterator.assertIterChildrenXor(
            nodeIdMapCollection,
            currentNode.node.id,
        );
        const reversedChildrenOfCurrentNode: ReadonlyArray<TXorNode> = [...childrenOfCurrentNode].reverse();
        nodeStack = nodeStack.concat(reversedChildrenOfCurrentNode);

        currentNode = nodeStack.pop();
    }

    nodeIds.sort((left: number, right: number) => left - right);
    const newNodeIdByOldNodeId: Map<number, number> = new Map(
        visitedXorNodes.map((xorNode: TXorNode, index: number) => {
            return [xorNode.node.id, nodeIds[index]];
        }),
    );

    return newNodeIdByOldNodeId;
}

// Given a mapping of (existingId) => (newId) this mutates the NodeIdMap.Collection and the TXorNodes it holds.
// Assumes the given arguments are valid as this function does no validation.
export function updateNodeIds(nodeIdMapCollection: Collection, newNodeIdByOldNodeId: Map<number, number>): void {
    if (newNodeIdByOldNodeId.size === 0) {
        return;
    }

    // We'll be iterating over them twice, so grab them once.
    const xorNodes: ReadonlyArray<TXorNode> = NodeIdMapIterator.assertIterXor(nodeIdMapCollection, [
        ...newNodeIdByOldNodeId.keys(),
    ]);

    // Storage for the change delta before modifying nodeIdMapCollection.
    const partialCollection: Collection = {
        astNodeById: new Map(),
        childIdsById: new Map(),
        contextNodeById: new Map(),
        maybeRightMostLeaf: undefined,
        parentIdById: new Map(),
    };

    // Build up the change delta.
    for (const xorNode of xorNodes) {
        const oldId: number = xorNode.node.id;
        const newId: number = newNodeIdByOldNodeId.get(oldId)!;

        if (xorNode.kind === XorNodeKind.Ast) {
            partialCollection.astNodeById.set(newId, xorNode.node);
        } else {
            partialCollection.contextNodeById.set(newId, xorNode.node);
        }

        // If the node has children and the change delta hasn't been calculated,
        // then calculate the children for the change delta.
        const maybeChildIds: ReadonlyArray<number> | undefined = nodeIdMapCollection.childIdsById.get(oldId);
        if (maybeChildIds !== undefined && !partialCollection.childIdsById.has(newId)) {
            const newChildIds: ReadonlyArray<number> = maybeChildIds.map(
                (childId: number) => newNodeIdByOldNodeId.get(childId) ?? childId,
            );
            partialCollection.childIdsById.set(newId, newChildIds);
        }

        // If the node has a parent,
        // then calculate the updated parent for the change delta.
        const maybeOldParentId: number | undefined = nodeIdMapCollection.parentIdById.get(oldId);
        if (maybeOldParentId !== undefined) {
            const newParentId: number = newNodeIdByOldNodeId.get(maybeOldParentId) ?? maybeOldParentId;
            partialCollection.parentIdById.set(newId, newParentId);

            // If the parent has children and the change delta hasn't been calculated for the parent's children,
            // then calculate the children for the change delta.
            if (!partialCollection.childIdsById.has(newParentId)) {
                const oldChildIdsOfParent: ReadonlyArray<number> = MapUtils.assertGet(
                    nodeIdMapCollection.childIdsById,
                    maybeOldParentId,
                );
                const newChildIdsOfParent: ReadonlyArray<number> = oldChildIdsOfParent.map(
                    (childId: number) => newNodeIdByOldNodeId.get(childId) ?? childId,
                );
                partialCollection.childIdsById.set(newParentId, newChildIdsOfParent);
            }
        }
    }

    // Apply the change delta
    for (const xorNode of xorNodes) {
        const oldId: number = xorNode.node.id;
        const newId: number = newNodeIdByOldNodeId.get(oldId)!;

        if (xorNode.kind === XorNodeKind.Ast) {
            const mutableNode: TypeScriptUtils.StripReadonly<Ast.TNode> = xorNode.node;
            mutableNode.id = newId;
            nodeIdMapCollection.astNodeById.set(newId, mutableNode);
            if (!partialCollection.astNodeById.has(oldId)) {
                nodeIdMapCollection.astNodeById.delete(oldId);
            }
        } else {
            const mutableNode: TypeScriptUtils.StripReadonly<ParseContext.Node> = xorNode.node;
            mutableNode.id = newId;
            nodeIdMapCollection.contextNodeById.set(newId, mutableNode);
            if (!partialCollection.contextNodeById.has(oldId)) {
                nodeIdMapCollection.contextNodeById.delete(oldId);
            }
        }

        const maybeParentId: number | undefined = partialCollection.parentIdById.get(newId);
        if (maybeParentId !== undefined) {
            nodeIdMapCollection.parentIdById.set(newId, maybeParentId);
            if (!partialCollection.parentIdById.has(oldId)) {
                MapUtils.assertDelete(nodeIdMapCollection.parentIdById, oldId);
            }
        } else {
            nodeIdMapCollection.parentIdById.delete(newId);
        }

        const maybeChildIds: ReadonlyArray<number> | undefined = partialCollection.childIdsById.get(newId);
        if (maybeChildIds !== undefined) {
            nodeIdMapCollection.childIdsById.set(newId, maybeChildIds);
            if (!partialCollection.parentIdById.has(oldId)) {
                MapUtils.assertDelete(nodeIdMapCollection.childIdsById, oldId);
            }
        } else {
            nodeIdMapCollection.childIdsById.delete(newId);
        }
    }
}

// -----------------------------------------------
// -------- Directional Selector Helpers  --------
// -----------------------------------------------

export function assertLeftMostXor(nodeIdMapCollection: Collection, nodeId: number): TXorNode {
    const maybeNode: TXorNode | undefined = maybeLeftMostXor(nodeIdMapCollection, nodeId);
    Assert.isDefined(maybeNode, `nodeId does not exist in nodeIdMapCollection`, { nodeId });

    return maybeNode;
}

export function maybeLeftMostXor(nodeIdMapCollection: Collection, nodeId: number): TXorNode | undefined {
    const currentNode: TXorNode | undefined = maybeXor(nodeIdMapCollection, nodeId);
    if (currentNode === undefined) {
        return undefined;
    }

    let currentNodeId: number = currentNode.node.id;
    let maybeChildIds: ReadonlyArray<number> | undefined = nodeIdMapCollection.childIdsById.get(currentNodeId);
    while (maybeChildIds?.length) {
        currentNodeId = maybeChildIds[0];
        maybeChildIds = nodeIdMapCollection.childIdsById.get(currentNodeId);
    }

    return maybeXor(nodeIdMapCollection, currentNodeId);
}

export function maybeLeftMostLeaf(nodeIdMapCollection: NodeIdMap.Collection, nodeId: number): Ast.TNode | undefined {
    const maybeNode: TXorNode | undefined = maybeLeftMostXor(nodeIdMapCollection, nodeId);

    return maybeNode?.kind === XorNodeKind.Ast ? maybeNode.node : undefined;
}

// There are a few assumed invariants about children:
//  * Children were read left to right.
//  * Children were placed in childIdsById in the order they were read.
//  * Therefore the right-most child is the most recently read which also appears last in the document.
export function maybeRightMostLeaf(
    nodeIdMapCollection: Collection,
    rootId: number,
    maybeCondition: ((node: Ast.TNode) => boolean) | undefined = undefined,
): Ast.TNode | undefined {
    const astNodeById: AstNodeById = nodeIdMapCollection.astNodeById;
    let nodeIdsToExplore: number[] = [rootId];
    let maybeRightMost: Ast.TNode | undefined;

    while (nodeIdsToExplore.length) {
        const nodeId: number = nodeIdsToExplore.pop()!;
        const maybeAstNode: Ast.TNode | undefined = astNodeById.get(nodeId);

        let addChildren: boolean = false;

        // Check if Ast.TNode or ParserContext.Node
        if (maybeAstNode !== undefined) {
            const astNode: Ast.TNode = maybeAstNode;
            if (maybeCondition && !maybeCondition(astNode)) {
                continue;
            }

            // Is leaf, check if it's more right than the previous record.
            // As it's a leaf there are no children to add.
            if (astNode.isLeaf) {
                // Is the first leaf encountered.
                if (maybeRightMost === undefined) {
                    maybeRightMost = astNode;
                }
                // Compare current leaf node to the existing record.
                else if (astNode.tokenRange.tokenIndexStart > maybeRightMost.tokenRange.tokenIndexStart) {
                    maybeRightMost = astNode;
                }
            }
            // Is not a leaf, no previous record exists.
            // Add all children to the queue.
            else if (maybeRightMost === undefined) {
                addChildren = true;
            }
            // Is not a leaf, previous record exists.
            // Check if we can cull the branch, otherwise add all children to the queue.
            else if (astNode.tokenRange.tokenIndexEnd > maybeRightMost.tokenRange.tokenIndexStart) {
                addChildren = true;
            }
        }
        // Must be a ParserContext.Node.
        // Add all children to the queue as ParserContext.Nodes can have Ast children which are leafs.
        else {
            addChildren = true;
        }

        if (addChildren) {
            const maybeChildIds: ReadonlyArray<number> | undefined = nodeIdMapCollection.childIdsById.get(nodeId);
            if (maybeChildIds !== undefined) {
                // Add the child ids in reversed order to prioritize visiting the right most nodes first.
                const childIds: ReadonlyArray<number> = maybeChildIds;
                const reversedChildIds: number[] = [...childIds];
                reversedChildIds.reverse();
                nodeIdsToExplore = [...reversedChildIds, ...nodeIdsToExplore];
            }
        }
    }

    return maybeRightMost;
}

export function maybeRightMostLeafWhere(
    nodeIdMapCollection: Collection,
    rootId: number,
    maybeCondition: ((node: Ast.TNode) => boolean) | undefined,
): Ast.TNode | undefined {
    return maybeRightMostLeaf(nodeIdMapCollection, rootId, maybeCondition);
}

// -----------------------------------
// -------- Selector Helpers  --------
// -----------------------------------

export function assertAst(astNodeById: AstNodeById, nodeId: number): Ast.TNode {
    return MapUtils.assertGet(astNodeById, nodeId);
}

export function assertContext(contextNodeById: ContextNodeById, nodeId: number): ParseContext.Node {
    return MapUtils.assertGet(contextNodeById, nodeId);
}

export function assertXor(nodeIdMapCollection: Collection, nodeId: number): TXorNode {
    const maybeNode: TXorNode | undefined = maybeXor(nodeIdMapCollection, nodeId);
    Assert.isDefined(maybeNode, undefined, { nodeId });

    return maybeNode;
}

export function maybeXor(nodeIdMapCollection: Collection, nodeId: number): TXorNode | undefined {
    const maybeAstNode: Ast.TNode | undefined = nodeIdMapCollection.astNodeById.get(nodeId);
    if (maybeAstNode) {
        return XorNodeUtils.astFactory(maybeAstNode);
    }

    const maybeContextNode: ParseContext.Node | undefined = nodeIdMapCollection.contextNodeById.get(nodeId);
    if (maybeContextNode) {
        return XorNodeUtils.contextFactory(maybeContextNode);
    }

    return undefined;
}

// -----------------------------------------
// -------- Parent Selector Helpers  --------
// -----------------------------------------

export function assertParentAst(
    nodeIdMapCollection: Collection,
    nodeId: number,
    maybeAllowedNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined = undefined,
): Ast.TNode {
    const maybeNode: Ast.TNode | undefined = maybeParentAst(nodeIdMapCollection, nodeId, maybeAllowedNodeKinds);
    Assert.isDefined(maybeNode, `nodeId doesn't have a parent`, { nodeId });

    return maybeNode;
}

export function assertParentXor(
    nodeIdMapCollection: Collection,
    nodeId: number,
    maybeAllowedNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined = undefined,
): TXorNode {
    const maybeNode: TXorNode | undefined = maybeParentXor(nodeIdMapCollection, nodeId, maybeAllowedNodeKinds);
    Assert.isDefined(maybeNode, `nodeId doesn't have a parent`, { nodeId });

    return maybeNode;
}

export function maybeParentAst(
    nodeIdMapCollection: Collection,
    childId: number,
    maybeAllowedNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined = undefined,
): Ast.TNode | undefined {
    const maybeParentId: number | undefined = nodeIdMapCollection.parentIdById.get(childId);
    if (maybeParentId === undefined) {
        return undefined;
    }
    const maybeParent: Ast.TNode | undefined = nodeIdMapCollection.astNodeById.get(maybeParentId);

    if (maybeParent === undefined) {
        return undefined;
    }
    const parent: Ast.TNode = maybeParent;

    if (maybeAllowedNodeKinds?.indexOf(parent.kind) === -1) {
        return undefined;
    }

    return parent;
}

export function maybeParentContext(
    nodeIdMapCollection: Collection,
    childId: number,
    maybeAllowedNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined = undefined,
): ParseContext.Node | undefined {
    const maybeParentId: number | undefined = nodeIdMapCollection.parentIdById.get(childId);
    if (maybeParentId === undefined) {
        return undefined;
    }
    const maybeParent: ParseContext.Node | undefined = nodeIdMapCollection.contextNodeById.get(maybeParentId);

    if (maybeParent === undefined) {
        return undefined;
    }
    const parent: ParseContext.Node = maybeParent;

    if (maybeAllowedNodeKinds?.indexOf(parent.kind) === -1) {
        return undefined;
    }

    return parent;
}

export function maybeParentXor(
    nodeIdMapCollection: Collection,
    childId: number,
    maybeAllowedNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined = undefined,
): TXorNode | undefined {
    const maybeAstNode: Ast.TNode | undefined = maybeParentAst(nodeIdMapCollection, childId, maybeAllowedNodeKinds);
    if (maybeAstNode !== undefined) {
        return XorNodeUtils.astFactory(maybeAstNode);
    }

    const maybeContextNode: ParseContext.Node | undefined = maybeParentContext(
        nodeIdMapCollection,
        childId,
        maybeAllowedNodeKinds,
    );
    if (maybeContextNode !== undefined) {
        return XorNodeUtils.contextFactory(maybeContextNode);
    }

    return undefined;
}

// -----------------------------------------
// -------- Child Selector Helpers  --------
// -----------------------------------------

export function assertChildAstByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): Ast.TNode {
    const maybeNode: Ast.TNode | undefined = maybeChildAstByAttributeIndex(
        nodeIdMapCollection,
        parentId,
        attributeIndex,
        maybeChildNodeKinds,
    );
    Assert.isDefined(maybeNode, `parentId doesn't have an Ast child at the given index`, { parentId, attributeIndex });

    return maybeNode;
}

export function assertChildContextByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): ParseContext.Node {
    const maybeNode: ParseContext.Node | undefined = maybeChildContextByAttributeIndex(
        nodeIdMapCollection,
        parentId,
        attributeIndex,
        maybeChildNodeKinds,
    );
    Assert.isDefined(maybeNode, `parentId doesn't have a context child at the given index`, {
        parentId,
        attributeIndex,
    });

    return maybeNode;
}

export function assertChildXorByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): TXorNode {
    const maybeNode: TXorNode | undefined = maybeChildXorByAttributeIndex(
        nodeIdMapCollection,
        parentId,
        attributeIndex,
        maybeChildNodeKinds,
    );
    Assert.isDefined(maybeNode, `parentId doesn't have a child at the given index`, { parentId, attributeIndex });

    return maybeNode;
}

export function maybeChildAstByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): Ast.TNode | undefined {
    const maybeNode: TXorNode | undefined = maybeChildXorByAttributeIndex(
        nodeIdMapCollection,
        parentId,
        attributeIndex,
        maybeChildNodeKinds,
    );

    return maybeNode?.kind === XorNodeKind.Ast ? maybeNode.node : undefined;
}

export function maybeChildContextByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): ParseContext.Node | undefined {
    const maybeNode: TXorNode | undefined = maybeChildXorByAttributeIndex(
        nodeIdMapCollection,
        parentId,
        attributeIndex,
        maybeChildNodeKinds,
    );

    return maybeNode?.kind === XorNodeKind.Context ? maybeNode.node : undefined;
}

// Nodes can be thought of as a collection bag which hold other nodes.
// The ArithmeticExpression `1 + 2` has three attributes:
//  * a literal node `1` as the first attribute.
//  * a literal operator constant `+` as the second attribute.
//  * a literal node `2` as the third attribute.
//
// This function takes a node id and an attribute index, then returns the nth child of the parent.
// Example: If the ArithmeticExpression above is the parent and attributeIndex is 0, you would get the node for '1'.
// Example: If the ArithmeticExpression above is the parent and attributeIndex is 1, you would get the node for '+'.
//
// If an array of NodeKind is given then an assert is made on the child (if it exists)
// that its kind matches any value inside is in it.
export function maybeChildXorByAttributeIndex(
    nodeIdMapCollection: Collection,
    parentId: number,
    attributeIndex: number,
    maybeChildNodeKinds: ReadonlyArray<Ast.NodeKind> | undefined,
): TXorNode | undefined {
    // Grab the node's childIds.
    const maybeChildIds: ReadonlyArray<number> | undefined = nodeIdMapCollection.childIdsById.get(parentId);
    if (maybeChildIds === undefined) {
        return undefined;
    }
    const childIds: ReadonlyArray<number> = maybeChildIds;

    // Iterate over the children and try to find one which matches attributeIndex.
    for (const childId of childIds) {
        const xorNode: TXorNode = assertXor(nodeIdMapCollection, childId);
        if (xorNode.node.maybeAttributeIndex === attributeIndex) {
            // If a Ast.NodeKind is given, validate the Ast.TNode at the given index matches the Ast.NodeKind.
            if (maybeChildNodeKinds !== undefined) {
                ArrayUtils.assertIn(maybeChildNodeKinds, xorNode.node.kind);
            }

            return xorNode;
        }
    }

    return undefined;
}

// -----------------------------------------------
// -------- Specialized Selector Helpers  --------
// -----------------------------------------------

// Returns the previous sibling of the given recursive expression.
// Commonly used for things like getting the identifier name used in an InvokeExpression.
export function assertRecursiveExpressionPreviousSibling(nodeIdMapCollection: Collection, nodeId: number): TXorNode {
    const xorNode: TXorNode = assertXor(nodeIdMapCollection, nodeId);
    const arrayWrapper: TXorNode = assertParentXor(nodeIdMapCollection, nodeId, [Ast.NodeKind.ArrayWrapper]);
    const maybeInvokeExpressionAttributeIndex: number | undefined = xorNode.node.maybeAttributeIndex;

    // It's not the first element in the ArrayWrapper.
    if (maybeInvokeExpressionAttributeIndex && maybeInvokeExpressionAttributeIndex > 0) {
        const childIds: ReadonlyArray<number> = NodeIdMapIterator.assertIterChildIds(
            nodeIdMapCollection.childIdsById,
            arrayWrapper.node.id,
        );
        const indexOfInvokeExprId: number = childIds.indexOf(xorNode.node.id);
        if (indexOfInvokeExprId === -1 || indexOfInvokeExprId === 0) {
            const details: {} = {
                invokeExprId: xorNode.node.id,
                arrayWrapperId: arrayWrapper.node.id,
                indexOfInvokeExprId,
            };
            throw new CommonError.InvariantError(
                `expected to find invokeExpr in arrayWrapper's children at an index > 0`,
                details,
            );
        }

        return assertChildXorByAttributeIndex(
            nodeIdMapCollection,
            arrayWrapper.node.id,
            indexOfInvokeExprId - 1,
            undefined,
        );
    }
    // It's the first element in ArrayWrapper, meaning we must grab RecursivePrimaryExpression.head
    else {
        const recursivePrimaryExpression: TXorNode = assertParentXor(nodeIdMapCollection, arrayWrapper.node.id);
        return assertChildXorByAttributeIndex(nodeIdMapCollection, recursivePrimaryExpression.node.id, 0, undefined);
    }
}

export function maybeInvokeExpressionName(nodeIdMapCollection: Collection, nodeId: number): string | undefined {
    const invokeExprXorNode: TXorNode = assertXor(nodeIdMapCollection, nodeId);
    XorNodeUtils.assertAstNodeKind(invokeExprXorNode, Ast.NodeKind.InvokeExpression);

    // The only place for an identifier in a RecursivePrimaryExpression is as the head, therefore an InvokeExpression
    // only has a name if the InvokeExpression is the 0th element in the RecursivePrimaryExpressionArray.
    let maybeName: string | undefined;
    if (invokeExprXorNode.node.maybeAttributeIndex === 0) {
        // Grab the RecursivePrimaryExpression's head if it's an IdentifierExpression
        const recursiveArrayXorNode: TXorNode = assertParentXor(nodeIdMapCollection, invokeExprXorNode.node.id);
        const recursiveExprXorNode: TXorNode = assertParentXor(nodeIdMapCollection, recursiveArrayXorNode.node.id);
        const headXorNode: TXorNode = assertChildXorByAttributeIndex(
            nodeIdMapCollection,
            recursiveExprXorNode.node.id,
            0,
            undefined,
        );
        if (headXorNode.node.kind === Ast.NodeKind.IdentifierExpression) {
            if (headXorNode.kind !== XorNodeKind.Ast) {
                const details: {} = {
                    identifierExpressionNodeId: headXorNode.node.id,
                    invokeExpressionNodeId: invokeExprXorNode.node.id,
                };
                throw new CommonError.InvariantError(
                    `the younger IdentifierExpression sibling should've finished parsing before the InvokeExpression node was reached`,
                    details,
                );
            }

            const identifierExpression: Ast.IdentifierExpression = headXorNode.node as Ast.IdentifierExpression;
            maybeName =
                identifierExpression.maybeInclusiveConstant === undefined
                    ? identifierExpression.identifier.literal
                    : identifierExpression.maybeInclusiveConstant.constantKind +
                      identifierExpression.identifier.literal;
        }
    }

    return maybeName;
}
