// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CommonError, Option, Result, ResultKind } from "../common";
import { KeywordKind, TExpressionKeywords, Token, TokenKind } from "../lexer";
import { Ast, NodeIdMap, ParseError } from "../parser";
import { ActiveNode, ActiveNodeUtils } from "./activeNode";
import { PositionUtils } from "./position";

export interface AutocompleteInspected {
    readonly maybeRequiredAutocomplete: Option<string>;
    readonly allowedAutocompleteKeywords: ReadonlyArray<KeywordKind>;
}

export function tryFrom(
    nodeIdMapCollection: NodeIdMap.Collection,
    maybeActiveNode: Option<ActiveNode>,
    maybeParseError: Option<ParseError.ParseError>,
): Result<AutocompleteInspected, CommonError.CommonError> {
    if (maybeActiveNode === undefined) {
        return {
            kind: ResultKind.Ok,
            value: ExpressionAutocomplete,
        };
    }

    const activeNode: ActiveNode = maybeActiveNode;
    const ancestry: ReadonlyArray<NodeIdMap.TXorNode> = activeNode.ancestry;
    const numNodes: number = ancestry.length;
    let maybeInspected: Option<AutocompleteInspected>;

    try {
        for (let index: number = 1; index < numNodes; index += 1) {
            const child: NodeIdMap.TXorNode = ancestry[index - 1];
            const parent: NodeIdMap.TXorNode = ancestry[index];

            // If a node is in a context state then it should be up to the parent to autocomplete.
            // Continue to let a later iteration handle autocomplete.
            if (
                parent.kind === NodeIdMap.XorNodeKind.Context &&
                PositionUtils.isOnContextNodeStart(activeNode.position, parent.node)
            ) {
                continue;
            }

            switch (parent.node.kind) {
                case Ast.NodeKind.ErrorHandlingExpression:
                    maybeInspected = autocompleteErrorHandlingExpression(
                        nodeIdMapCollection,
                        activeNode,
                        parent,
                        child,
                        maybeParseError,
                    );
                    break;

                default:
                    const mapKey: string = createMapKey(parent.node.kind, child.node.maybeAttributeIndex);
                    maybeInspected = AutocompleteMap.get(mapKey);
                    break;
            }

            if (maybeInspected !== undefined) {
                break;
            }
        }
    } catch (err) {
        return {
            kind: ResultKind.Err,
            error: CommonError.ensureCommonError(err),
        };
    }

    return {
        kind: ResultKind.Ok,
        value: maybeInspected !== undefined ? maybeInspected : EmptyAutocomplete,
    };
}

const EmptyAutocomplete: AutocompleteInspected = {
    maybeRequiredAutocomplete: undefined,
    allowedAutocompleteKeywords: [],
};

const ExpressionAutocomplete: AutocompleteInspected = {
    maybeRequiredAutocomplete: undefined,
    allowedAutocompleteKeywords: TExpressionKeywords,
};

const AutocompleteMap: Map<string, AutocompleteInspected> = new Map([
    // Ast.NodeKind.ErrorRaisingExpression
    [createMapKey(Ast.NodeKind.ErrorRaisingExpression, 0), autocompleteConstantFactory(Ast.ConstantKind.Error)],
    [createMapKey(Ast.NodeKind.ErrorRaisingExpression, 1), ExpressionAutocomplete],

    // Ast.NodeKind.GeneralizedIdentifierPairedExpression
    [createMapKey(Ast.NodeKind.GeneralizedIdentifierPairedExpression, 2), ExpressionAutocomplete],

    // Ast.NodeKind.IdentifierPairedExpression
    [createMapKey(Ast.NodeKind.IdentifierPairedExpression, 2), ExpressionAutocomplete],

    // Ast.NodeKind.IdentifierExpressionPairedExpression
    [createMapKey(Ast.NodeKind.IdentifierExpressionPairedExpression, 2), ExpressionAutocomplete],

    // Ast.NodeKind.IfExpression
    [createMapKey(Ast.NodeKind.IfExpression, 0), autocompleteConstantFactory(Ast.ConstantKind.If)],
    [createMapKey(Ast.NodeKind.IfExpression, 1), ExpressionAutocomplete],
    [createMapKey(Ast.NodeKind.IfExpression, 2), autocompleteConstantFactory(Ast.ConstantKind.Then)],
    [createMapKey(Ast.NodeKind.IfExpression, 3), ExpressionAutocomplete],
    [createMapKey(Ast.NodeKind.IfExpression, 4), autocompleteConstantFactory(Ast.ConstantKind.Else)],
    [createMapKey(Ast.NodeKind.IfExpression, 5), ExpressionAutocomplete],

    // Ast.NodeKind.InvokeExpression
    [createMapKey(Ast.NodeKind.InvokeExpression, 0), ExpressionAutocomplete],
    [createMapKey(Ast.NodeKind.InvokeExpression, 1), ExpressionAutocomplete],
    [createMapKey(Ast.NodeKind.InvokeExpression, 2), ExpressionAutocomplete],

    // Ast.NodeKind.IfExpression
    [createMapKey(Ast.NodeKind.ListExpression, 1), ExpressionAutocomplete],

    // Ast.NodeKind.OtherwiseExpression
    [createMapKey(Ast.NodeKind.OtherwiseExpression, 0), autocompleteConstantFactory(Ast.ConstantKind.Otherwise)],
    [createMapKey(Ast.NodeKind.OtherwiseExpression, 1), ExpressionAutocomplete],

    // Ast.NodeKind.ParenthesizedExpression
    [createMapKey(Ast.NodeKind.ParenthesizedExpression, 1), ExpressionAutocomplete],
]);

// [parent XorNode.node.kind, child XorNode.node.maybeAttributeIndex].join(",")
function createMapKey(nodeKind: Ast.NodeKind, maybeAttributeIndex: Option<number>): string {
    return [nodeKind, maybeAttributeIndex].join(",");
}

function autocompleteConstantFactory(constantKind: Ast.ConstantKind): AutocompleteInspected {
    return {
        maybeRequiredAutocomplete: constantKind,
        allowedAutocompleteKeywords: [],
    };
}

function autocompleteErrorHandlingExpression(
    nodeIdMapCollection: NodeIdMap.Collection,
    activeNode: ActiveNode,
    parent: NodeIdMap.TXorNode,
    child: NodeIdMap.TXorNode,
    maybeParseError: Option<ParseError.ParseError>,
): Option<AutocompleteInspected> {
    const maybeChildAttributeIndex: Option<number> = child.node.maybeAttributeIndex;
    if (maybeChildAttributeIndex === 0) {
        return autocompleteConstantFactory(Ast.ConstantKind.Try);
    } else if (maybeChildAttributeIndex === 1) {
        if (
            child.kind === NodeIdMap.XorNodeKind.Ast &&
            PositionUtils.isAfterAstNode(activeNode.position, child.node, true)
        ) {
            return {
                allowedAutocompleteKeywords: [],
                maybeRequiredAutocomplete: KeywordKind.Otherwise,
            };
        } else {
            return ExpressionAutocomplete;
        }
    } else {
        return undefined;
    }
}
