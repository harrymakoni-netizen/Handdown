import {readFile} from 'node:fs/promises';
import {before, after, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp} from 'firebase/firestore';
const owner='rS4BSfSY2Gdc3jw8MNfOYa4zflq1';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-handdown',firestore:{rules:await readFile('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.clearFirestore()});
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const member=(uid,role)=>({uid,role,createdAt:serverTimestamp()});
test('only provisioned owner can create the training workspace',async()=>{
 const data={name:'Training workshop',ownerUid:owner,createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db(),'workspaces/training'),data));
 await assertFails(setDoc(doc(db('stranger'),'workspaces/training'),data));
 await assertSucceeds(setDoc(doc(db(owner),'workspaces/training'),data));
 await assertFails(setDoc(doc(db(owner),'workspaces/another'),data));
 await assertFails(setDoc(doc(db(owner),'workspaces/training'),{...data,ownerUid:'stranger'}));
});
test('owner bootstraps own membership and adds a learner',async()=>{
 await assertSucceeds(getDoc(doc(db(owner),'workspaces/training')));
 const ownerDb=db(owner);
 await assertSucceeds(runTransaction(ownerDb,async tx=>{
   const w=doc(ownerDb,'workspaces/training');
   const m=doc(ownerDb,`workspaces/training/members/${owner}`);
   await Promise.all([tx.get(w),tx.get(m)]);
   tx.set(w,{name:'Training workshop',ownerUid:owner,createdAt:serverTimestamp()});
   tx.set(m,member(owner,'owner'));
 }));
 await assertSucceeds(setDoc(doc(db(owner),'workspaces/training/members/student'),member('student','learner')));
 await assertSucceeds(getDoc(doc(db('student'),'workspaces/training/members/student')));
});
test('users cannot self-enrol, elevate roles or read other memberships',async()=>{
 await assertFails(setDoc(doc(db('stranger'),'workspaces/training/members/stranger'),member('stranger','owner')));
 await assertFails(getDoc(doc(db(),'workspaces/training/members/student')));
 await assertFails(getDoc(doc(db('stranger'),`workspaces/training/members/${owner}`)));
 await assertSucceeds(setDoc(doc(db(owner),'workspaces/training/members/student'),member('student','learner')));
 await assertFails(setDoc(doc(db('student'),'workspaces/training/members/student'),member('student','supervisor')));
 await assertFails(deleteDoc(doc(db('student'),'workspaces/training/members/student')));
});
test('reject malformed membership, second owner and all unimplemented data writes',async()=>{
 await assertFails(setDoc(doc(db(owner),'workspaces/training/members/student'),member('student','owner')));
 await assertFails(setDoc(doc(db(owner),'workspaces/training/members/student'),{...member('student','learner'),admin:true}));
 await assertFails(setDoc(doc(db(owner),'workspaces/training/members/student'),member('wrong','learner')));
 await assertFails(setDoc(doc(db(owner),'workspaces/training/lessons/example'),{title:'Unauthorized publication'}));
 await assertFails(deleteDoc(doc(db(owner),`workspaces/training/members/${owner}`)));
});
