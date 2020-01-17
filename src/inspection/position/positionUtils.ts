// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { isNever, Option } from "../../common";
import { Token, TokenPosition } from "../../lexer";
import { Ast, NodeIdMap, NodeIdMapUtils, ParserContext } from "../../parser";
import { Position } from "./position";

export function isBeforeOrOnXorNodeStart(position: Position, xorNode: NodeIdMap.TXorNode): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isBeforeOrOnAstNodeStart(position, xorNode.node);

        case NodeIdMap.XorNodeKind.Context:
            return isBeforeOrOnContextNodeStart(position, xorNode.node);

        default:
            throw isNever(xorNode);
    }
}

export function isBeforeXorNode(position: Position, xorNode: NodeIdMap.TXorNode): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isBeforeAstNode(position, xorNode.node);

        case NodeIdMap.XorNodeKind.Context:
            return isBeforeContextNode(position, xorNode.node);

        default:
            throw isNever(xorNode);
    }
}

export function isInXorNode(
    position: Position,
    nodeIdMapCollection: NodeIdMap.Collection,
    xorNode: NodeIdMap.TXorNode,
    exclusiveUpperBound: boolean = true,
): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isInAstNode(position, xorNode.node, exclusiveUpperBound);

        case NodeIdMap.XorNodeKind.Context:
            return isInContextNode(position, nodeIdMapCollection, xorNode.node);

        default:
            throw isNever(xorNode);
    }
}

export function isOnXorNodeStart(position: Position, xorNode: NodeIdMap.TXorNode): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isOnAstNodeStart(position, xorNode.node);

        case NodeIdMap.XorNodeKind.Context:
            return isOnContextNodeStart(position, xorNode.node);

        default:
            throw isNever(xorNode);
    }
}

export function isOnXorNodeEnd(position: Position, xorNode: NodeIdMap.TXorNode): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isOnAstNodeEnd(position, xorNode.node);

        case NodeIdMap.XorNodeKind.Context:
            return false;

        default:
            throw isNever(xorNode);
    }
}

export function isAfterXorNode(
    position: Position,
    nodeIdMapCollection: NodeIdMap.Collection,
    xorNode: NodeIdMap.TXorNode,
    exclusiveUpperBound: boolean = true,
): boolean {
    switch (xorNode.kind) {
        case NodeIdMap.XorNodeKind.Ast:
            return isAfterAstNode(position, xorNode.node, exclusiveUpperBound);

        case NodeIdMap.XorNodeKind.Context:
            return isAfterContextNode(position, nodeIdMapCollection, xorNode.node, exclusiveUpperBound);

        default:
            throw isNever(xorNode);
    }
}

export function isBeforeContextNode(position: Position, contextNode: ParserContext.Node): boolean {
    const maybeTokenStart: Option<Token> = contextNode.maybeTokenStart;
    if (maybeTokenStart === undefined) {
        return false;
    }
    const tokenStart: Token = maybeTokenStart;

    return isBeforeTokenPosition(position, tokenStart.positionStart);
}

export function isBeforeOrOnContextNodeStart(position: Position, contextNode: ParserContext.Node): boolean {
    return isBeforeContextNode(position, contextNode) || isOnContextNodeStart(position, contextNode);
}

export function isInContextNode(
    position: Position,
    nodeIdMapCollection: NodeIdMap.Collection,
    contextNode: ParserContext.Node,
): boolean {
    return (
        !isBeforeContextNode(position, contextNode) && !isAfterContextNode(position, nodeIdMapCollection, contextNode)
    );
}

export function isOnContextNodeStart(position: Position, contextNode: ParserContext.Node): boolean {
    return contextNode.maybeTokenStart !== undefined
        ? isOnTokenPosition(position, contextNode.maybeTokenStart.positionStart)
        : false;
}

export function isAfterContextNode(
    position: Position,
    nodeIdMapCollection: NodeIdMap.Collection,
    contextNode: ParserContext.Node,
    exclusiveUpperBound: boolean = true,
): boolean {
    const maybeLeaf: Option<Ast.TNode> = NodeIdMapUtils.maybeRightMostLeaf(nodeIdMapCollection, contextNode.id);
    if (maybeLeaf === undefined) {
        // We're assuming position is a valid range for the document.
        // Therefore if the context node didn't have a token (caused by EOF) we can make this assumption.
        if (contextNode.maybeTokenStart === undefined) {
            return false;
        } else {
            return isAfterTokenPosition(position, contextNode.maybeTokenStart.positionEnd, exclusiveUpperBound);
        }
    }
    const leaf: Ast.TNode = maybeLeaf;

    return isAfterAstNode(position, leaf, exclusiveUpperBound);
}

export function isBeforeAstNode(position: Position, astNode: Ast.TNode): boolean {
    return isBeforeTokenPosition(position, astNode.tokenRange.positionStart);
}

export function isInAstNode(position: Position, astNode: Ast.TNode, exclusiveUpperBound: boolean = true): boolean {
    return !isBeforeAstNode(position, astNode) && !isAfterAstNode(position, astNode, exclusiveUpperBound);
}

export function isOnAstNodeStart(position: Position, astNode: Ast.TNode): boolean {
    return isOnTokenPosition(position, astNode.tokenRange.positionStart);
}

export function isOnAstNodeEnd(position: Position, astNode: Ast.TNode): boolean {
    return isOnTokenPosition(position, astNode.tokenRange.positionEnd);
}

export function isBeforeOrOnAstNodeStart(position: Position, astNode: Ast.TNode): boolean {
    return isBeforeAstNode(position, astNode) || isOnAstNodeStart(position, astNode);
}

export function isAfterAstNode(position: Position, astNode: Ast.TNode, exclusiveUpperBound: boolean): boolean {
    return isAfterTokenPosition(position, astNode.tokenRange.positionEnd, exclusiveUpperBound);
}

export function isBeforeTokenPosition(position: Position, tokenPositionStart: TokenPosition): boolean {
    const positionLineNumber: number = position.lineNumber;

    if (positionLineNumber < tokenPositionStart.lineNumber) {
        return true;
    } else if (positionLineNumber > tokenPositionStart.lineNumber) {
        return false;
    } else {
        return position.lineCodeUnit < tokenPositionStart.lineCodeUnit;
    }
}

export function isOnTokenPosition(position: Position, tokenPosition: TokenPosition): boolean {
    return position.lineNumber === tokenPosition.lineNumber && position.lineCodeUnit === tokenPosition.lineCodeUnit;
}

export function isAfterTokenPosition(
    position: Position,
    tokenPosition: TokenPosition,
    exclusiveUpperBound: boolean,
): boolean {
    const positionLineNumber: number = position.lineNumber;

    if (positionLineNumber < tokenPosition.lineNumber) {
        return false;
    } else if (positionLineNumber > tokenPosition.lineNumber) {
        return true;
    } else {
        // Offset the fact that tokenPositionEnd has an exclusive range
        if (exclusiveUpperBound) {
            return position.lineCodeUnit > tokenPosition.lineCodeUnit - 1;
        } else {
            return position.lineCodeUnit > tokenPosition.lineCodeUnit;
        }
    }
}
