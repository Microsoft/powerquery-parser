// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Option, Traverse } from "../common";
import { Ast, NodeIdMap } from "../parser";
import { IInspectedNode, InspectedInvokeExpression } from "./node";
import { Position } from "./position";
import { TPositionIdentifier } from "./positionIdentifier";

export type State = KeywordState & IdentifierState;

export type Inspected = KeywordInspected & IdentifierInspected;

export interface IState<T> extends Traverse.IState<T> {
    readonly position: Position;
    readonly nodeIdMapCollection: NodeIdMap.Collection;
    readonly leafNodeIds: ReadonlyArray<number>;
}

export interface KeywordState extends IState<KeywordInspected> {
    isKeywordInspectionDone: boolean;
}

export interface IdentifierState extends IState<IdentifierInspected> {
    // If the position is on either an (Identifier | GeneralizedIdentifier)
    // If we encounter the assignment for this identifier then it's stored in Inspected.maybeIdentifierUnderPosition
    readonly maybeIdentifierUnderPosition: Option<Ast.Identifier | Ast.GeneralizedIdentifier>;
}

// tslint:disable-next-line: no-empty-interface
export interface IInspected {}

export interface KeywordInspected extends IInspected {
    readonly allowedKeywords: ReadonlyArray<string>;
    readonly maybeRequiredKeyword: Option<string>;
    readonly keywordVisitedNodes: ReadonlyArray<IInspectedNode>;
}

export interface IdentifierInspected extends IInspected {
    readonly identifierVisitedNodes: ReadonlyArray<IInspectedNode>;
    // A map of (identifier, what caused the identifier to be added).
    readonly scope: ReadonlyMap<string, NodeIdMap.TXorNode>;
    // Metadata on the first InvokeExpression encountered.
    readonly maybeInvokeExpression: Option<InspectedInvokeExpression>;
    // If the position picks either an (Identifier | GeneralizedIdentifier) as its leaf node,
    // then if we encounter the identifier's assignment we will store metadata.
    readonly maybeIdentifierUnderPosition: Option<TPositionIdentifier>;
}
